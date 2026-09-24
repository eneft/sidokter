'use strict';

function classifyStorageRequest(method, pathName) {
  const normalizedPath = String(pathName || '').toLowerCase();
  const normalizedMethod = String(method || '').toUpperCase();

  if (normalizedMethod === 'POST' && (
    normalizedPath === '/upload' ||
    normalizedPath === '/storageapi/upload' ||
    normalizedPath.endsWith('/upload')
  )) return 'upload';

  if (normalizedMethod === 'POST' && (
    normalizedPath === '/optimize' ||
    normalizedPath === '/storageapi/optimize' ||
    normalizedPath.endsWith('/optimize')
  )) return 'optimize';

  if ((normalizedMethod === 'GET' || normalizedMethod === 'HEAD') && normalizedPath.includes('/path/')) {
    return 'download-path';
  }
  if ((normalizedMethod === 'GET' || normalizedMethod === 'HEAD') && normalizedPath.includes('/sop/')) {
    return 'download-sop';
  }
  if ((normalizedMethod === 'GET' || normalizedMethod === 'HEAD') && normalizedPath.includes('/files/')) {
    return 'download-file';
  }
  if (normalizedMethod === 'DELETE' && normalizedPath.includes('/files/')) return 'delete-file';
  return 'not-found';
}

module.exports = { classifyStorageRequest };
