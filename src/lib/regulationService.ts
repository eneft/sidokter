/**
 * REGULASI SERVICE
 * Repository regulasi eksternal daerah (PERDA/PERBUP). Binary PDF tetap asli
 * dan menggunakan documentLibraryService + Firebase Storage authoritative.
 */
import { LibraryDocument, UserRole } from '../types';
import {
  subscribeToLibraryDocuments,
  uploadDocument,
  updateDocument,
  deleteDocument,
  getDocumentUrl,
  getLibraryDocumentsForBackup,
  getLibraryFilesForBackup
} from './documentLibraryService';

export const REGULATION_TYPE = 'REGULASI' as const;

export function subscribeToRegulationDocuments(
  onData: (documents: LibraryDocument[]) => void,
  onError?: (err: any) => void
) {
  return subscribeToLibraryDocuments(
    (docs) => onData(docs.filter((d) => d.type === REGULATION_TYPE)),
    onError
  );
}

export function uploadRegulation(
  file: File,
  title: string,
  uploadedBy?: string,
  actorRole?: UserRole,
  metadata?: any,
  actorBadges?: string[]
) {
  return uploadDocument(file, REGULATION_TYPE, title, uploadedBy, actorRole, metadata, actorBadges);
}

export function updateRegulation(id: string, updates: any, updatedBy?: string, actorRole?: UserRole) {
  return updateDocument(id, updates, updatedBy, actorRole);
}

export function deleteRegulation(document: LibraryDocument, actorRole?: UserRole) {
  return deleteDocument(document, actorRole);
}

export function getRegulationDocumentUrl(document: LibraryDocument) {
  return getDocumentUrl(document);
}

export function getAllRegulationsForBackup() {
  return getLibraryDocumentsForBackup(REGULATION_TYPE);
}

export function getAllRegulationFilesForBackup() {
  return getLibraryFilesForBackup(REGULATION_TYPE);
}
