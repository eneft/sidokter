import { LibraryDocument } from '../types';

/**
 * Reconcile a create result with the browser cache by canonical Firestore ID.
 * The realtime snapshot may arrive before setDoc resolves, so blindly appending
 * the same create result can otherwise render the one Firestore document twice.
 */
export function upsertLibraryDocumentById(
  documents: LibraryDocument[],
  document: LibraryDocument
): LibraryDocument[] {
  const existingIndex = documents.findIndex((item) => item.id === document.id);
  if (existingIndex < 0) return [...documents, document];

  const reconciled = [...documents];
  reconciled[existingIndex] = document;
  return reconciled;
}

export interface SingleFlightGuard {
  tryStart: () => boolean;
  finish: () => void;
}

/** Synchronous guard; unlike React state, it closes before a second event fires. */
export function createSingleFlightGuard(): SingleFlightGuard {
  let inFlight = false;
  return {
    tryStart: () => {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    finish: () => {
      inFlight = false;
    }
  };
}
