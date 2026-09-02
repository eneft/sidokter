/**
 * MOU SERVICE
 * Service khusus dokumen Memorandum of Understanding (MOU). Penyimpanan bersama hanya berada di documentLibraryService.
 */
import { LibraryDocument, UserRole } from '../types';
import { subscribeToLibraryDocuments, uploadDocument, updateDocument, deleteDocument, getDocumentUrl, getLibraryDocumentsForBackup, getLibraryFilesForBackup } from './documentLibraryService';

export const MOU_TYPE = 'MOU' as const;
export function subscribeToMOUDocuments(onData: (documents: LibraryDocument[]) => void, onError?: (err:any)=>void) { return subscribeToLibraryDocuments((docs) => onData(docs.filter(d => d.type === MOU_TYPE)), onError); }
export function uploadMOU(file: File, title: string, uploadedBy?: string, actorRole?: UserRole, metadata?: any, actorBadges?: string[]) { return uploadDocument(file, MOU_TYPE, title, uploadedBy, actorRole, metadata, actorBadges); }
export function updateMOU(id: string, updates: any, updatedBy?: string, actorRole?: UserRole) { return updateDocument(id, updates, updatedBy, actorRole); }
export function deleteMOU(document: LibraryDocument, actorRole?: UserRole) { return deleteDocument(document, actorRole); }
export function getMOUDocumentUrl(document: LibraryDocument) { return getDocumentUrl(document); }
export function getAllMOUForBackup() { return getLibraryDocumentsForBackup(MOU_TYPE); }
export function getAllMOUFilesForBackup() { return getLibraryFilesForBackup(MOU_TYPE); }
