import { LibraryDocument, LibraryDocumentType, UserRole } from '../types';
import { saveNamedFileToLocalCache, getNamedFileFromLocalCache, deleteNamedFileFromLocalCache, getFileFromPersistentCacheAsync } from '../utils/fileStorage';
import { authenticatedFetch } from './authService';
import { saveLibraryDocToFirestore, deleteLibraryDocFromFirestore, subscribeToFirestoreLibraryDocs, fetchLibraryDocsFromFirestore } from './firestoreService';
import { uploadFileToCloudStorage, resolveViewableUrl } from './cloudStorageService';

const LIBRARY_KEY = 'soegiri_offline_library_v1';
const subscribers = new Set<() => void>();
let firestoreSyncInitialized = false;

function getDocuments(): LibraryDocument[] {
  try { const raw = localStorage.getItem(LIBRARY_KEY); return raw ? JSON.parse(raw) as LibraryDocument[] : []; } catch { return []; }
}
function saveDocuments(documents: LibraryDocument[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(documents));
  subscribers.forEach((fn) => fn());
}

function initFirestoreSync() {
  if (firestoreSyncInitialized) return;
  firestoreSyncInitialized = true;

  // Initial fetch from Firestore
  void fetchLibraryDocsFromFirestore().then((cloudDocs) => {
    if (!cloudDocs || !cloudDocs.length) return;
    const local = getDocuments();
    const map = new Map<string, LibraryDocument>();
    local.forEach((d) => map.set(d.id, d));
    cloudDocs.forEach((d) => {
      const exist = map.get(d.id);
      map.set(d.id, { ...exist, ...d });
    });
    saveDocuments(Array.from(map.values()));
  });

  // Real-time snapshot listener
  subscribeToFirestoreLibraryDocs((cloudDocs) => {
    if (!cloudDocs || !cloudDocs.length) return;
    const local = getDocuments();
    const map = new Map<string, LibraryDocument>();
    local.forEach((d) => map.set(d.id, d));
    cloudDocs.forEach((d) => {
      const exist = map.get(d.id);
      map.set(d.id, { ...exist, ...d });
    });
    saveDocuments(Array.from(map.values()));
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
  if (!['SK','MOU'].includes(type)) throw new Error('Jenis dokumen tidak valid.');
  if (!file || file.type !== 'application/pdf') throw new Error('File harus berupa PDF.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Ukuran PDF maksimal 20 MB.');
  if (!title.trim()) throw new Error('Judul dokumen wajib diisi.');
  const id = `library-${type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  
  // Read Data URL for local fast cache
  const dataUrl = await new Promise<string>((resolve,reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Gagal membaca file PDF.'));
    r.readAsDataURL(file);
  });
  await saveNamedFileToLocalCache(`library_${id}`, dataUrl);

  // Upload to Cloud Server Storage so all other devices can access it permanently
  let cloudUrl = `local://${id}`;
  try {
    const uploadRes = await uploadFileToCloudStorage(dataUrl, file.name, id);
    if (uploadRes?.url) {
      cloudUrl = uploadRes.url;
    }
  } catch (uploadErr) {
    console.warn('[uploadDocument] Cloud storage upload warning, relying on local cache:', uploadErr);
  }

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
    storagePath: cloudUrl,
    downloadUrl: cloudUrl,
    createdAt: now,
    updatedAt: now,
    uploadedBy
  };
  saveDocuments([...getDocuments(), document]);
  void saveLibraryDocToFirestore(document);
  return document;
}

export async function updateDocument(id:string, updates:any, updatedBy?:string, actorRole?:UserRole):Promise<void>{
  if(actorRole!=='admin') throw new Error('Akses ditolak. Hanya Admin yang dapat mengedit dokumen.');
  const all=getDocuments(); const i=all.findIndex(d=>d.id===id); if(i<0) throw new Error('Dokumen tidak ditemukan.');
  all[i]={...all[i],...updates,title:String(updates.title ?? all[i].title).trim(),updatedAt:new Date().toISOString(),updatedBy};
  saveDocuments(all);
  void saveLibraryDocToFirestore(all[i]);
}
export async function deleteDocument(document:LibraryDocument,actorRole?:UserRole):Promise<void>{
  if(actorRole!=='admin') throw new Error('Akses ditolak. Hanya Admin yang dapat menghapus dokumen.');
  await deleteNamedFileFromLocalCache(`library_${document.id}`);
  saveDocuments(getDocuments().filter(d=>d.id!==document.id));
  void deleteLibraryDocFromFirestore(document.id);
  // Delete from server storage if cloud url
  if (document.downloadUrl && document.downloadUrl.startsWith('/api/storage/files/')) {
    const fileId = document.downloadUrl.replace('/api/storage/files/', '');
    void authenticatedFetch(`/api/storage/files/${fileId}`, { method: 'DELETE' }).catch(() => {});
  }
}
export async function getDocumentUrl(document: LibraryDocument): Promise<string | null> {
  // Check local cache first
  const named = await getNamedFileFromLocalCache(`library_${document.id}`);
  if (named) return named;

  const legacy = await getFileFromPersistentCacheAsync(document.id, 'file');
  if (legacy) {
    await saveNamedFileToLocalCache(`library_${document.id}`, legacy);
    return legacy;
  }

  // Resolve cloud URL
  const viewUrl = await resolveViewableUrl(document.downloadUrl || document.storagePath, `library_${document.id}`);
  if (viewUrl) return viewUrl;

  // Auto-check server storage with document id
  const fallbackServerUrl = `/api/storage/files/${document.id}`;
  try {
    const head = await authenticatedFetch(fallbackServerUrl, { method: 'HEAD' });
    if (head.ok) return fallbackServerUrl;
  } catch {}

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
  const valid = documents.filter((d) => d && (d.type === 'SK' || d.type === 'MOU'));
  saveDocuments(valid);
  for (const d of valid) { const data = files[`library_${d.id}`]; if (data) await saveNamedFileToLocalCache(`library_${d.id}`, data); }
}

/**
 * Compatibility aliases for legacy Library UI components.
 * Canonical API remains uploadDocument/deleteDocument/getDocumentUrl.
 * These aliases keep existing callers working while the document domains
 * (SPO/SK/MOU) remain separated at the service layer.
 */
export const uploadLibraryDocument = uploadDocument;
export const deleteLibraryDocument = deleteDocument;
export const getLibraryDocumentUrl = getDocumentUrl;
