/**
 * SK SERVICE
 * Service khusus dokumen Surat Keputusan (SK). Penyimpanan bersama hanya berada di documentLibraryService.
 */
import { LibraryDocument, UserRole } from '../types';
import { subscribeToLibraryDocuments, uploadDocument, updateDocument, deleteDocument, getDocumentUrl, getLibraryDocumentsForBackup, getLibraryFilesForBackup } from './documentLibraryService';

export const SK_TYPE = 'SK' as const;
export function subscribeToSKDocuments(onData: (documents: LibraryDocument[]) => void, onError?: (err:any)=>void) { return subscribeToLibraryDocuments((docs) => onData(docs.filter(d => d.type === SK_TYPE)), onError); }
export function uploadSK(file: File, title: string, uploadedBy?: string, actorRole?: UserRole, metadata?: any) { return uploadDocument(file, SK_TYPE, title, uploadedBy, actorRole, metadata); }
export function updateSK(id: string, updates: any, updatedBy?: string, actorRole?: UserRole) { return updateDocument(id, updates, updatedBy, actorRole); }
export function deleteSK(document: LibraryDocument, actorRole?: UserRole) { return deleteDocument(document, actorRole); }
export function getSKDocumentUrl(document: LibraryDocument) { return getDocumentUrl(document); }
export function getAllSKForBackup() { return getLibraryDocumentsForBackup(SK_TYPE); }
export function getAllSKFilesForBackup() { return getLibraryFilesForBackup(SK_TYPE); }
