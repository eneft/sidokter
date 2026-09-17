'use strict';

/**
 * Resolve the Firebase Storage object referenced by a storage_files document.
 * Current records use objectPath. storagePath/filename are accepted only for
 * records written by the retired server-storage implementation; no local file
 * is read and no metadata is rewritten here.
 */
function resolveStorageObjectPath(meta) {
  if (!meta || typeof meta !== 'object') return null;

  const direct = [meta.objectPath, meta.storagePath]
    .find(value => typeof value === 'string' && value.trim());
  if (direct) {
    const objectPath = direct.trim().replace(/^\/+/, '');
    return objectPath && !objectPath.includes('..') ? objectPath : null;
  }

  if (typeof meta.filename !== 'string' || !meta.filename.trim()) return null;
  const filename = meta.filename.trim().replace(/^\/+/, '');
  if (filename.includes('/') || filename.includes('..')) return null;

  const type = String(meta.resourceType || '').trim().toLowerCase();
  if (!['spo', 'sk', 'mou'].includes(type)) return null;
  return `sidokter/${type}/${filename}`;
}

module.exports = { resolveStorageObjectPath };
