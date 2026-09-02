import { LibraryDocument, LibraryDocumentType, UserRole } from '../types';
import { saveNamedFileToLocalCache, getNamedFileFromLocalCache, deleteNamedFileFromLocalCache, getFileFromPersistentCacheAsync } from '../utils/fileStorage';

const LIBRARY_KEY = 'soegiri_offline_library_v1';
const subscribers = new Set<() => void>();

function getDocuments(): LibraryDocument[] {
  try { const raw = localStorage.getItem(LIBRARY_KEY); return raw ? JSON.parse(raw) as LibraryDocument[] : []; } catch { return []; }
}
function saveDocuments(documents: LibraryDocument[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(documents));
  subscribers.forEach((fn) => fn());
}

export function subscribeToLibraryDocuments(onData: (documents: LibraryDocument[]) => void, onError?: (err: any) => void) {
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
  const dataUrl = await new Promise<string>((resolve,reject) => { const r = new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=()=>reject(new Error('Gagal membaca file PDF.')); r.readAsDataURL(file); });
  await saveNamedFileToLocalCache(`library_${id}`, dataUrl);
  const now = new Date().toISOString();
  const document: LibraryDocument = { id,type,title:title.trim(),documentNumber:metadata?.documentNumber?.trim()||undefined,partnerName:metadata?.partnerName?.trim()||undefined,effectiveDate:metadata?.effectiveDate||undefined,expiryDate:metadata?.expiryDate||undefined,description:metadata?.description?.trim()||undefined,status:metadata?.status||'AKTIF',fileName:file.name,fileSize:file.size,fileType:file.type,storagePath:`local://${id}`,downloadUrl:`local://${id}`,createdAt:now,updatedAt:now,uploadedBy };
  saveDocuments([...getDocuments(), document]);
  return document;
}

export async function updateDocument(id:string, updates:any, updatedBy?:string, actorRole?:UserRole):Promise<void>{
  if(actorRole!=='admin') throw new Error('Akses ditolak. Hanya Admin yang dapat mengedit dokumen.');
  const all=getDocuments(); const i=all.findIndex(d=>d.id===id); if(i<0) throw new Error('Dokumen tidak ditemukan.');
  all[i]={...all[i],...updates,title:String(updates.title ?? all[i].title).trim(),updatedAt:new Date().toISOString(),updatedBy}; saveDocuments(all);
}
export async function deleteDocument(document:LibraryDocument,actorRole?:UserRole):Promise<void>{
  if(actorRole!=='admin') throw new Error('Akses ditolak. Hanya Admin yang dapat menghapus dokumen.');
  await deleteNamedFileFromLocalCache(`library_${document.id}`);
  saveDocuments(getDocuments().filter(d=>d.id!==document.id));
}
export async function getDocumentUrl(document: LibraryDocument): Promise<string | null> {
  // Remote/external URLs remain valid as-is. Local documents are resolved from
  // the persistent named cache first, then from the legacy SPO file cache.
  // The legacy fallback allows older SK/MOU records to survive migrations where
  // metadata remained but the storage-key convention changed.
  if (document.downloadUrl && !document.downloadUrl.startsWith('local://')) return document.downloadUrl;

  const named = await getNamedFileFromLocalCache(`library_${document.id}`);
  if (named) return named;

  const legacy = await getFileFromPersistentCacheAsync(document.id, 'file');
  if (legacy) {
    // Repair the document into the canonical persistent library cache so future
    // previews/downloads do not depend on the legacy key.
    await saveNamedFileToLocalCache(`library_${document.id}`, legacy);
    return legacy;
  }

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
