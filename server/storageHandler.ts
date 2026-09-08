import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { verifyServerSession } from './authHandler';

const STORAGE_DIR = path.resolve(process.cwd(), 'data', 'storage');
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB hard ceiling for document uploads
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const META_FILE = path.resolve(process.cwd(), 'data', 'storage_meta.json');

interface StoredFileMeta {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  filename: string;
  resourceType: 'SPO' | 'SK' | 'MOU' | 'OTHER';
  ownerUid: string;
  accessKeys: string[];
}

function ensureStorageDir(): Record<string, StoredFileMeta> {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  if (fs.existsSync(META_FILE)) {
    try {
      const raw = fs.readFileSync(META_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function saveMeta(meta: Record<string, StoredFileMeta>) {
  try {
    const dir = path.dirname(META_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (err) {
    console.error('[storageHandler] Failed to write storage metadata:', err);
  }
}

export async function handleStorageUpload(req: Request, res: Response) {
  try {
    const session = await verifyServerSession(req);
    const isStructural = session.badges.some((b) => String(b).trim().toUpperCase() === 'STRUKTURAL');
    const isAdmin = session.role === 'admin';
    const metaMap = ensureStorageDir();
    const { fileData, fileName, fileType, id: requestedId } = req.body || {};

    if (!fileData || typeof fileData !== 'string') {
      return res.status(400).json({ success: false, message: 'fileData (Base64 atau DataURL) wajib disertakan.' });
    }

    const safeName = String(fileName || 'dokumen.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const id = String(requestedId || `file_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    // The id is only a storage/document reference. It is never a permission boundary.
    const isLibraryDocument = id.startsWith('library-');
    const resourceType: StoredFileMeta['resourceType'] = isLibraryDocument
      ? (id.startsWith('library-mou-') ? 'MOU' : 'SK')
      : 'SPO';

    if (isLibraryDocument && !isAdmin && !isStructural) {
      return res.status(403).json({ success: false, message: 'Akses upload SK/MOU ditolak.' });
    }

    let mimeType = String(fileType || 'application/pdf');
    let buffer: Buffer;
    const maxEncodedLength = Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 4096;
    if (fileData.length > maxEncodedLength) {
      return res.status(413).json({ success: false, message: 'Ukuran file terlalu besar. Maksimum 15 MB.' });
    }

    if (fileData.startsWith('data:')) {
      const commaIdx = fileData.indexOf(',');
      if (commaIdx !== -1) {
        const metaPart = fileData.slice(0, commaIdx);
        const match = metaPart.match(/data:([^;]+)/);
        if (match && match[1]) mimeType = match[1];
        buffer = Buffer.from(fileData.slice(commaIdx + 1), 'base64');
      } else {
        buffer = Buffer.from(fileData);
      }
    } else {
      buffer = Buffer.from(fileData, 'base64');
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return res.status(415).json({ success: false, message: 'Jenis file tidak didukung. Gunakan PDF, PNG, atau JPEG.' });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ success: false, message: 'Ukuran file terlalu besar. Maksimum 15 MB.' });
    }

    const ext = path.extname(safeName) || (mimeType.includes('pdf') ? '.pdf' : mimeType.includes('png') ? '.png' : '.jpg');
    const diskFileName = `${id}${ext}`;
    const diskPath = path.join(STORAGE_DIR, diskFileName);
    fs.writeFileSync(diskPath, buffer);

    // Access metadata is derived server-side from the authenticated user.
    // The browser cannot assign itself another owner or hierarchy scope.
    const normalize = (v: unknown) => String(v || '').trim().replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
    const accessKeys = new Set<string>();
    const assignments = Array.isArray(session.assignments) && session.assignments.length
      ? session.assignments
      : (Array.isArray(session.divisionCodes) && session.divisionCodes.length
        ? session.divisionCodes.map((divisionCode) => ({ divisionCode }))
        : [{ divisionCode: session.divisionCode, subCode: session.subCode, instCode: session.instCode, poliCode: session.poliCode, subUnitCode: session.subUnitCode }]);
    for (const assignment of assignments) {
      const division = normalize(assignment?.divisionCode).toUpperCase();
      if (!division) continue;
      accessKeys.add(division);
      const hierarchy = normalize(assignment?.hierarchyCode || assignment?.hierarchyPath?.filter(Boolean).join('.') || [assignment?.subCode, assignment?.instCode, assignment?.poliCode, assignment?.subUnitCode].filter(Boolean).join('.'));
      if (hierarchy) {
        const parts = hierarchy.split('.').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) accessKeys.add(`${division}|${parts.slice(0, i).join('.')}`);
      }
    }

    const record: StoredFileMeta = {
      id,
      originalName: safeName,
      mimeType,
      size: buffer.length,
      uploadedAt: new Date().toISOString(),
      filename: diskFileName,
      resourceType,
      ownerUid: session.authUid,
      accessKeys: Array.from(accessKeys)
    };
    metaMap[id] = record;
    saveMeta(metaMap);

    return res.status(200).json({ success: true, fileId: id, url: `/api/storage/files/${id}`, fileName: safeName, fileSize: buffer.length, mimeType });
  } catch (err: any) {
    const code = String(err?.message || '');
    const isAuthError =
      code.includes('SESSION_REVOKED') ||
      code.includes('SESSION_EXPIRED') ||
      code.includes('SESSION_REQUIRED') ||
      code.includes('UNAUTHENTICATED') ||
      code.includes('USER_NOT_FOUND') ||
      ['SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_REQUIRED', 'UNAUTHENTICATED', 'USER_NOT_FOUND'].includes(code);

    if (isAuthError) {
      console.warn('[storageHandler] Upload unauthorized:', code);
      return res.status(401).json({
        success: false,
        code: code.includes('SESSION_REVOKED') ? 'SESSION_REVOKED' : 'SESSION_EXPIRED',
        message: 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.'
      });
    }
    console.error('[storageHandler] Upload error:', err);
    return res.status(500).json({ success: false, message: err?.message || 'Gagal menyimpan file ke server.' });
  }
}
export async function handleStorageDownload(req: Request, res: Response) {
  try {
    const session = await verifyServerSession(req);
    const requestedId = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const metaMap = ensureStorageDir();
    const meta = metaMap[requestedId];

    // No metadata = no authorization decision = fail closed.
    if (!meta || !meta.filename || !fs.existsSync(path.join(STORAGE_DIR, meta.filename))) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan di server.' });
    }

    const isAdmin = session.role === 'admin';
    const isStructural = session.badges.some((b) => String(b).trim().toUpperCase() === 'STRUKTURAL');
    // IMPORTANT: do not trust persisted `globalAccess` flags from older metadata.
    // Structural/Admin is an actor privilege, not a property that makes a file
    // globally readable by ordinary users.
    const allowed = isAdmin || isStructural || meta.ownerUid === session.authUid;
    if (!allowed) {
      const sessionKeys = new Set<string>();
      const assignments = Array.isArray(session.assignments) && session.assignments.length
        ? session.assignments
        : (Array.isArray(session.divisionCodes) ? session.divisionCodes.map((divisionCode) => ({ divisionCode })) : [{ divisionCode: session.divisionCode }]);
      const normalize = (v: unknown) => String(v || '').trim().replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
      for (const assignment of assignments) {
        const division = normalize(assignment?.divisionCode).toUpperCase();
        if (!division) continue;
        sessionKeys.add(division);
        const hierarchy = normalize(assignment?.hierarchyCode || assignment?.hierarchyPath?.filter(Boolean).join('.') || [assignment?.subCode, assignment?.instCode, assignment?.poliCode, assignment?.subUnitCode].filter(Boolean).join('.'));
        if (hierarchy) {
          const parts = hierarchy.split('.').filter(Boolean);
          for (let i = 1; i <= parts.length; i++) sessionKeys.add(`${division}|${parts.slice(0, i).join('.')}`);
        }
      }
      if (!meta.accessKeys?.some((key) => sessionKeys.has(key))) {
        return res.status(403).json({ success: false, message: 'Akses dokumen ditolak.' });
      }
    }

    const diskPath = path.join(STORAGE_DIR, meta.filename);
    const stat = fs.statSync(diskPath);
    res.setHeader('Content-Type', meta.mimeType || 'application/pdf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.originalName || 'dokumen.pdf')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(diskPath).pipe(res);
  } catch (err: any) {
    const code = String(err?.message || '');
    const isAuthError =
      code.includes('SESSION_REVOKED') ||
      code.includes('SESSION_EXPIRED') ||
      code.includes('SESSION_REQUIRED') ||
      code.includes('UNAUTHENTICATED') ||
      code.includes('USER_NOT_FOUND') ||
      ['SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_REQUIRED', 'UNAUTHENTICATED', 'USER_NOT_FOUND'].includes(code);

    if (isAuthError) {
      console.warn('[storageHandler] Download unauthorized:', code);
      return res.status(401).json({
        success: false,
        code: code.includes('SESSION_REVOKED') ? 'SESSION_REVOKED' : 'SESSION_EXPIRED',
        message: 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.'
      });
    }
    console.error('[storageHandler] Download error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil file.' });
  }
}
export async function handleStorageDelete(req: Request, res: Response) {
  try {
    const session = await verifyServerSession(req);
    if (session.role !== 'admin') return res.status(403).json({ success: false, message: 'Akses hapus file ditolak. Hanya Admin Root.' });
    const metaMap = ensureStorageDir();
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const meta = metaMap[id];

    if (meta && meta.filename) {
      const diskPath = path.join(STORAGE_DIR, meta.filename);
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
      delete metaMap[id];
      saveMeta(metaMap);
    }

    return res.status(200).json({ success: true, message: 'File berhasil dihapus.' });
  } catch (err: any) {
    const code = String(err?.message || '');
    const isAuthError =
      code.includes('SESSION_REVOKED') ||
      code.includes('SESSION_EXPIRED') ||
      code.includes('SESSION_REQUIRED') ||
      code.includes('UNAUTHENTICATED') ||
      code.includes('USER_NOT_FOUND') ||
      ['SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_REQUIRED', 'UNAUTHENTICATED', 'USER_NOT_FOUND'].includes(code);

    if (isAuthError) {
      console.warn('[storageHandler] Delete unauthorized:', code);
      return res.status(401).json({
        success: false,
        code: code.includes('SESSION_REVOKED') ? 'SESSION_REVOKED' : 'SESSION_EXPIRED',
        message: 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.'
      });
    }
    console.error('[storageHandler] Delete error:', err);
    return res.status(500).json({ success: false, message: 'Gagal menghapus file.' });
  }
}
