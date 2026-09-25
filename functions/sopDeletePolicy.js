'use strict';

function policyError(code, status, message) {
  const error = new Error(code);
  error.sopDeleteStatus = status;
  error.sopDeleteCode = code;
  error.sopDeleteMessage = message;
  return error;
}

/**
 * Pure lifecycle decision for SPO deletion.
 *
 * DELETE_ARCHIVE is deliberately opt-in. An old client that calls sop-delete
 * without the explicit permanent intent will keep the historical behavior and
 * only archive an official document. This prevents accidental permanent
 * deletion on retries or stale UI state.
 */
function decideSopDeleteAction({
  stored,
  isAdmin,
  isCreator,
  permanentArchiveDeleteRequested = false,
}) {
  const status = String(stored?.status || '').trim().toUpperCase();
  const wasEverActive = stored?.everActivated === true ||
    status === 'AKTIF' ||
    status === 'DIARSIPKAN' ||
    Boolean(stored?.activatedAt);

  if (status === 'DIARSIPKAN') {
    if (!isAdmin) {
      throw policyError(
        'PERMISSION_DENIED',
        403,
        'SPO arsip hanya dapat dihapus permanen oleh Administrator.'
      );
    }
    return permanentArchiveDeleteRequested ? 'DELETE_ARCHIVE' : 'ARCHIVE';
  }

  if (wasEverActive) {
    if (!isAdmin) {
      throw policyError(
        'PERMISSION_DENIED',
        403,
        'SPO yang pernah aktif hanya dapat diarsipkan oleh Administrator.'
      );
    }
    return 'ARCHIVE';
  }

  if (!isAdmin && !isCreator) {
    throw policyError(
      'PERMISSION_DENIED',
      403,
      'Anda hanya dapat menghapus permanen DRAFT yang Anda buat sendiri.'
    );
  }

  if (status !== 'DRAFT') {
    throw policyError(
      'CANNOT_DELETE_ACTIVE',
      400,
      'Hanya draft SPO yang dapat dihapus permanen.'
    );
  }

  return 'DELETE_DRAFT';
}

module.exports = {
  decideSopDeleteAction,
};
