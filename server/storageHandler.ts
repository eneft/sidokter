import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { verifyServerSession } from './authHandler';

const STORAGE_DIR = path.resolve(process.cwd(), 'data', 'storage');
const META_FILE = path.resolve(process.cwd(), 'data', 'storage_meta.json');
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

interface StoredFileMeta {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  filename: string;
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
    await verifyServerSession(req);

    const metaMap = ensureStorageDir();
    const { fileData, fileName, fileType, id: requestedId } = req.body || {};

    if (!fileData || typeof fileData !== 'string') {
      return res.status(400).json({ success: false, message: 'fileData (Base64 atau DataURL) wajib disertakan.' });
    }

    const safeName = String(fileName || 'dokumen.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const id = String(requestedId || `file_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`).replace(/[^a-zA-Z0-9_-]/g, '_');

    let mimeType = String(fileType || 'application/pdf').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) {
      return res.status(415).json({ success: false, message: 'Tipe file tidak diizinkan.' });
    }
    let buffer: Buffer;

    if (fileData.startsWith('data:')) {
      const commaIdx = fileData.indexOf(',');
      if (commaIdx !== -1) {
        const metaPart = fileData.slice(0, commaIdx);
        const match = metaPart.match(/data:([^;]+)/);
        if (match && match[1]) mimeType = match[1];
        const base64Str = fileData.slice(commaIdx + 1);
        buffer = Buffer.from(base64Str, 'base64');
      } else {
        buffer = Buffer.from(fileData);
      }
    } else {
      buffer = Buffer.from(fileData, 'base64');
    }

    if (!ALLOWED_MIME.has(mimeType)) {
      return res.status(415).json({ success: false, message: 'Tipe file tidak diizinkan.' });
    }
    if (buffer.length === 0) return res.status(400).json({ success: false, message: 'File kosong tidak dapat disimpan.' });
    if (buffer.length > MAX_FILE_BYTES) return res.status(413).json({ success: false, message: 'Ukuran file maksimal 25 MB.' });

    const ext = path.extname(safeName) || (mimeType.includes('pdf') ? '.pdf' : mimeType.includes('png') ? '.png' : mimeType.includes('jpeg') ? '.jpg' : '.bin');
    const diskFileName = `${id}${ext}`;
    const diskPath = path.join(STORAGE_DIR, diskFileName);

    fs.writeFileSync(diskPath, buffer);

    const record: StoredFileMeta = {
      id,
      originalName: safeName,
      mimeType,
      size: buffer.length,
      uploadedAt: new Date().toISOString(),
      filename: diskFileName
    };

    metaMap[id] = record;
    saveMeta(metaMap);

    const publicUrl = `/api/storage/files/${id}`;

    return res.status(200).json({
      success: true,
      fileId: id,
      url: publicUrl,
      fileName: safeName,
      fileSize: buffer.length,
      mimeType
    });
  } catch (err: any) {
    console.error('[storageHandler] Upload error:', err);
    const code = String(err?.message || '');
    const status = code === 'UNAUTHENTICATED' || code === 'SESSION_REVOKED' ? 401 : code === 'FORBIDDEN' ? 403 : 500;
    return res.status(status).json({ success: false, message: status === 401 ? 'Sesi login tidak valid.' : err?.message || 'Gagal menyimpan file ke server.' });
  }
}

export async function handleStorageDownload(req: Request, res: Response) {
  try {
    await verifyServerSession(req);

    const metaMap = ensureStorageDir();
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const meta = metaMap[id];

    let diskPath = '';
    let mimeType = 'application/pdf';
    let originalName = 'dokumen.pdf';

    if (meta && meta.filename) {
      diskPath = path.join(STORAGE_DIR, meta.filename);
      mimeType = meta.mimeType || 'application/pdf';
      originalName = meta.originalName || 'dokumen.pdf';
    } else {
      // Direct file search by id prefix
      const files = fs.readdirSync(STORAGE_DIR);
      const match = files.find(f => f.startsWith(id));
      if (match) {
        diskPath = path.join(STORAGE_DIR, match);
        if (match.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (match.endsWith('.png')) mimeType = 'image/png';
        else if (match.endsWith('.jpg') || match.endsWith('.jpeg')) mimeType = 'image/jpeg';
        originalName = match;
      }
    }

    if (!diskPath || !fs.existsSync(diskPath)) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan di server.' });
    }

    const stat = fs.statSync(diskPath);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(diskPath);
    stream.pipe(res);
  } catch (err: any) {
    console.error('[storageHandler] Download error:', err);
    const code = String(err?.message || '');
    const status = code === 'UNAUTHENTICATED' || code === 'SESSION_REVOKED' ? 401 : code === 'FORBIDDEN' ? 403 : 500;
    return res.status(status).json({ success: false, message: status === 401 ? 'Sesi login tidak valid.' : 'Gagal mengambil file.' });
  }
}

export async function handleStorageDelete(req: Request, res: Response) {
  try {
    const session = await verifyServerSession(req);
    if (session.role !== 'admin') return res.status(403).json({ success: false, message: 'Hanya Administrator yang dapat menghapus file.' });

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
    console.error('[storageHandler] Delete error:', err);
    const code = String(err?.message || '');
    const status = code === 'UNAUTHENTICATED' || code === 'SESSION_REVOKED' ? 401 : code === 'FORBIDDEN' ? 403 : 500;
    return res.status(status).json({ success: false, message: status === 401 ? 'Sesi login tidak valid.' : status === 403 ? 'Akses ditolak.' : 'Gagal menghapus file.' });
  }
}
