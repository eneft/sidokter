import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Request, Response } from 'express';

const STORAGE_DIR = path.resolve(process.cwd(), 'data', 'storage');
const META_FILE = path.resolve(process.cwd(), 'data', 'storage_meta.json');

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

export function handleStorageUpload(req: Request, res: Response) {
  try {
    const metaMap = ensureStorageDir();
    const { fileData, fileName, fileType, id: requestedId } = req.body || {};

    if (!fileData || typeof fileData !== 'string') {
      return res.status(400).json({ success: false, message: 'fileData (Base64 atau DataURL) wajib disertakan.' });
    }

    const safeName = String(fileName || 'dokumen.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const id = String(requestedId || `file_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`).replace(/[^a-zA-Z0-9_-]/g, '_');

    let mimeType = String(fileType || 'application/pdf');
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
    return res.status(500).json({ success: false, message: err?.message || 'Gagal menyimpan file ke server.' });
  }
}

export function handleStorageDownload(req: Request, res: Response) {
  try {
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
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const stream = fs.createReadStream(diskPath);
    stream.pipe(res);
  } catch (err: any) {
    console.error('[storageHandler] Download error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil file.' });
  }
}

export function handleStorageDelete(req: Request, res: Response) {
  try {
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
    return res.status(500).json({ success: false, message: 'Gagal menghapus file.' });
  }
}
