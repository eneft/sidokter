import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { verifyServerSession } from './authHandler';
import { generateOfficialSopPdfBuffer, generateOfficialLibraryPdfBuffer } from './sopPdfGenerator';

let serverFirestoreDb: any = null;
async function getServerFirestore() {
  if (!serverFirestoreDb) {
    try {
      const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (!fs.existsSync(configPath)) return null;
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getFirestore } = await import('firebase/firestore');
      const app = getApps().length === 0 ? initializeApp({
        apiKey: config.apiKey,
        projectId: config.projectId,
        storageBucket: config.storageBucket
      }) : getApp();
      serverFirestoreDb = getFirestore(app, config.firestoreDatabaseId || '(default)');
    } catch (e) {
      console.warn('[Storage] Firestore lazy init warning:', e);
    }
  }
  return serverFirestoreDb;
}

async function recoverOrSynthesizeFile(requestedId: string, baseId: string): Promise<StoredFileMeta | null> {
  const db = await getServerFirestore();
  if (!db) return null;

  try {
    const { doc, getDoc } = await import('firebase/firestore');

    // 1. Check if ID matches an SOP pattern: sop-1234567890
    const sopMatch = requestedId.match(/(sop-\d+)/i) || baseId.match(/(sop-\d+)/i);
    if (sopMatch) {
      const sopId = sopMatch[1];
      const snap = await getDoc(doc(db, 'sops', sopId));
      if (snap.exists()) {
        const sopData: any = snap.data();
        let pdfBuffer: Buffer | null = null;
        let originalName = sopData.fileName || `${sopData.title || requestedId}.pdf`;

        const isOldFileReq = requestedId.includes('oldFile') || requestedId.includes('legacy');
        const isSignedScanReq = requestedId.includes('signedScan') || requestedId.includes('scan');

        let dataUrlToDecode: string | undefined;
        if (isOldFileReq && typeof sopData.oldFileDataUrl === 'string' && sopData.oldFileDataUrl.startsWith('data:')) {
          dataUrlToDecode = sopData.oldFileDataUrl;
        } else if (isSignedScanReq && typeof sopData.signedScanDataUrl === 'string' && sopData.signedScanDataUrl.startsWith('data:')) {
          dataUrlToDecode = sopData.signedScanDataUrl;
        } else if (!isOldFileReq && !isSignedScanReq && typeof sopData.fileDataUrl === 'string' && sopData.fileDataUrl.startsWith('data:')) {
          // fileDataUrl is only valid for the live/current SPO document.
          // Never substitute it for oldFile/legacy evidence or signed scans.
          dataUrlToDecode = sopData.fileDataUrl;
        }

        if (dataUrlToDecode) {
          try {
            const base64Part = dataUrlToDecode.split(',')[1] || dataUrlToDecode;
            pdfBuffer = Buffer.from(base64Part, 'base64');
          } catch (e) {
            console.warn('[Storage] Error decoding base64 dataUrl for', requestedId, e);
          }
        }

        // IMPORTANT: oldFile/legacy and signedScan are source evidence documents.
        // Never fall back to generating a new official SPO PDF for these references.
        // If a local copy exists under the original storage filename, recover that exact
        // binary; otherwise return null so the caller produces a real 404 instead of
        // silently replacing the evidence with a regenerated document.
        if (!pdfBuffer || pdfBuffer.length === 0) {
          if (isOldFileReq || isSignedScanReq) {
            const sourcePathValue = isOldFileReq
              ? (sopData.oldStoragePath || sopData.oldFileUrl || sopData.oldSignedScanStoragePath || sopData.oldSignedScanUrl)
              : (sopData.signedScanStoragePath || sopData.signedScanUrl);

            const sourceFilename = sourcePathValue
              ? path.basename(String(sourcePathValue).split('?')[0])
              : '';

            const evidenceCandidates = [
              sourceFilename,
              isOldFileReq ? `${sopId}_oldFile.pdf` : `${sopId}_signedScan.pdf`,
              isOldFileReq ? `${sopId}_oldFile.png` : `${sopId}_signedScan.png`,
              isOldFileReq ? `${sopId}_oldFile.jpg` : `${sopId}_signedScan.jpg`
            ].filter(Boolean);

            for (const candidate of evidenceCandidates) {
              const candidatePath = path.join(STORAGE_DIR, candidate);
              if (fs.existsSync(candidatePath)) {
                const stat = fs.statSync(candidatePath);
                if (stat.isFile()) {
                  pdfBuffer = fs.readFileSync(candidatePath);
                  originalName = isOldFileReq
                    ? (sopData.oldFileName || candidate)
                    : (sopData.signedScanFileName || candidate);
                  break;
                }
              }
            }

            // Do NOT use fileDataUrl here. That is the current/live SPO file and
            // must never be substituted for old evidence or a signed scan.
            if (!pdfBuffer || pdfBuffer.length === 0) {
              console.warn(`[Storage] Original evidence not found; refusing to synthesize ${requestedId}`);
              return null;
            }
          } else {
            originalName = sopData.fileName || `${sopData.title || sopId}.pdf`;
            pdfBuffer = await generateOfficialSopPdfBuffer(sopData).catch(() => null);
          }
        }

        if (pdfBuffer && pdfBuffer.length > 0) {
          const diskFilename = `${requestedId}.pdf`;
          const filePath = path.join(STORAGE_DIR, diskFilename);
          fs.writeFileSync(filePath, pdfBuffer);

          const meta: StoredFileMeta = {
            id: requestedId,
            originalName,
            mimeType: 'application/pdf',
            size: pdfBuffer.length,
            uploadedAt: new Date().toISOString(),
            filename: diskFilename,
            resourceType: 'SPO',
            ownerUid: sopData.creatorUid || 'admin-root',
            accessKeys: Array.isArray(sopData.accessKeys) && sopData.accessKeys.length ? sopData.accessKeys : ['ALL'],
            storagePath: `sidokter/spo/${diskFilename}`
          };

          const metaMap = ensureStorageDir();
          metaMap[requestedId] = meta;
          if (isOldFileReq) {
            metaMap[`${sopId}_oldFile`] = meta;
          } else if (isSignedScanReq) {
            metaMap[`${sopId}_signedScan`] = meta;
          } else {
            metaMap[baseId] = meta;
            if (!metaMap[sopId]) metaMap[sopId] = meta;
          }
          saveMeta(metaMap);

          console.log(`[Storage] Auto-synthesized and cached missing PDF for ${requestedId} (${pdfBuffer.length} bytes)`);
          return meta;
        }
      }
    }

    // 2. Check if ID matches library_documents
    const docMatch = requestedId.match(/(doc-\d+|sk-\d+|mou-\d+)/i) || baseId.match(/(doc-\d+|sk-\d+|mou-\d+)/i);
    if (docMatch) {
      const docId = docMatch[1];
      const snap = await getDoc(doc(db, 'library_documents', docId));
      if (snap.exists()) {
        const docData: any = snap.data();
        const pdfBuffer = await generateOfficialLibraryPdfBuffer({
          title: docData.title || docData.fileName || 'DOKUMEN REGULASI',
          documentNumber: docData.documentNumber || docData.nomor || '-',
          type: docData.type || 'DOKUMEN REGULASI',
          category: docData.category || 'UMUM',
          year: docData.year || new Date().getFullYear().toString(),
          signer: docData.signer || 'Direktur RSUD Dr. Soegiri',
          effectiveDate: docData.effectiveDate || '-',
          summary: docData.summary || docData.description || 'Dokumen regulasi resmi RSUD Dr. Soegiri Lamongan.'
        }).catch(() => null);

        if (pdfBuffer && pdfBuffer.length > 0) {
          const diskFilename = `${requestedId}.pdf`;
          const filePath = path.join(STORAGE_DIR, diskFilename);
          fs.writeFileSync(filePath, pdfBuffer);

          const meta: StoredFileMeta = {
            id: requestedId,
            originalName: docData.fileName || `${docData.title || requestedId}.pdf`,
            mimeType: 'application/pdf',
            size: pdfBuffer.length,
            uploadedAt: new Date().toISOString(),
            filename: diskFilename,
            resourceType: (docData.type === 'SK' ? 'SK' : docData.type === 'MOU' ? 'MOU' : 'OTHER'),
            ownerUid: docData.createdBy || 'admin-root',
            accessKeys: ['ALL'],
            storagePath: `sidokter/library/${diskFilename}`
          };

          const metaMap = ensureStorageDir();
          metaMap[requestedId] = meta;
          metaMap[baseId] = meta;
          saveMeta(metaMap);

          console.log(`[Storage] Auto-synthesized and cached library document for ${requestedId} (${pdfBuffer.length} bytes)`);
          return meta;
        }
      }
    }
  } catch (err) {
    console.warn('[Storage] Error in recoverOrSynthesizeFile:', err);
  }

  return null;
}

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
  storagePath?: string;
}

function ensureStorageDir(): Record<string, StoredFileMeta> {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  let meta: Record<string, StoredFileMeta> = {};
  if (fs.existsSync(META_FILE)) {
    try {
      const raw = fs.readFileSync(META_FILE, 'utf-8');
      meta = JSON.parse(raw);
    } catch {
      meta = {};
    }
  }

  // Auto-scan STORAGE_DIR to index any files physically present on disk
  try {
    const diskFiles = fs.readdirSync(STORAGE_DIR);
    let changed = false;
    for (const file of diskFiles) {
      if (!file || file.startsWith('.')) continue;
      const fullPath = path.join(STORAGE_DIR, file);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        // Check if this file is already indexed
        const ext = path.extname(file);
        const fileId = path.basename(file, ext);
        const alreadyIndexed = meta[fileId] || Object.values(meta).some((m) => m.filename === file);
        if (!alreadyIndexed) {
          const lowerExt = ext.toLowerCase();
          const mimeType = lowerExt === '.png'
            ? 'image/png'
            : lowerExt === '.jpg' || lowerExt === '.jpeg'
              ? 'image/jpeg'
              : 'application/pdf';
          const resourceType: StoredFileMeta['resourceType'] = fileId.startsWith('library-mou-')
            ? 'MOU'
            : fileId.startsWith('library-')
              ? 'SK'
              : 'SPO';

          meta[fileId] = {
            id: fileId,
            originalName: file,
            mimeType,
            size: stat.size,
            uploadedAt: stat.mtime.toISOString(),
            filename: file,
            resourceType,
            ownerUid: 'admin-root',
            accessKeys: ['ALL'],
            storagePath: `sidokter/spo/${file}`
          };
          changed = true;
        }
      } catch {}
    }
    if (changed) {
      saveMeta(meta);
    }
  } catch (scanErr) {
    console.warn('[storageHandler] Warning scanning storage dir:', scanErr);
  }

  return meta;
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
      accessKeys: Array.from(accessKeys),
      storagePath: `sidokter/${resourceType.toLowerCase()}/${diskFileName}`
    };
    metaMap[id] = record;
    saveMeta(metaMap);

    return res.status(200).json({ success: true, fileId: id, url: `/api/storage/files/${id}`, storagePath: record.storagePath, fileName: safeName, fileSize: buffer.length, mimeType });
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
export async function handleStorageDownloadByPath(req: Request, res: Response) {
  try {
    if (!req.headers['x-session-id'] && req.query.sessionId) req.headers['x-session-id'] = String(req.query.sessionId);
    if (!req.headers.authorization && req.query.token) req.headers.authorization = `Bearer ${String(req.query.token)}`;
    if (!req.headers['x-soegiri-auth-uid'] && req.query.uid) req.headers['x-soegiri-auth-uid'] = String(req.query.uid);
    if (!req.headers['x-user-username'] && req.query.username) req.headers['x-user-username'] = String(req.query.username);
    const raw = String(req.params.storagePath || (req.params as any)[0] || '');
    let storagePath = '';
    try { storagePath = decodeURIComponent(raw); } catch { storagePath = raw; }
    storagePath = storagePath.replace(/^\/+/, '');
    if (!storagePath) return res.status(404).json({ success:false, message:'Storage path tidak valid.' });
    
    const metaMap = ensureStorageDir();
    const targetFilename = path.basename(storagePath);
    const targetBaseId = path.basename(targetFilename, path.extname(targetFilename));

    // Priority 1: Match metadata entry where physical file actually exists on disk
    let entry = Object.values(metaMap).find((meta) => {
      if (!meta || !meta.filename) return false;
      const onDisk = path.join(STORAGE_DIR, meta.filename);
      if (!fs.existsSync(onDisk)) return false;
      const sp = String(meta.storagePath || '').replace(/^\/+/, '');
      if (sp && sp === storagePath) return true;
      if (meta.filename === targetFilename) return true;
      if (meta.id === targetBaseId || meta.id === targetFilename) return true;
      if (sp && storagePath && (sp.endsWith('/' + storagePath) || storagePath.endsWith('/' + sp))) return true;
      return false;
    });

    // Priority 2: Direct file check in STORAGE_DIR
    if (!entry) {
      const candidates = [
        targetFilename,
        `${targetBaseId}.pdf`,
        `${targetBaseId}.png`,
        `${targetBaseId}.jpg`,
        `${targetBaseId}_file.pdf`,
        `${targetBaseId}_signedScan.pdf`,
        `${targetBaseId}_oldFile.pdf`
      ];
      for (const cand of candidates) {
        const candPath = path.join(STORAGE_DIR, cand);
        if (fs.existsSync(candPath)) {
          const stat = fs.statSync(candPath);
          if (stat.isFile()) {
            const id = path.basename(cand, path.extname(cand));
            req.params.id = id;
            return handleStorageDownload(req, res);
          }
        }
      }
    }

    if (!entry) {
      const recovered = await recoverOrSynthesizeFile(targetFilename, targetBaseId);
      if (recovered) {
        req.params.id = recovered.id;
        return handleStorageDownload(req, res);
      }
      return res.status(404).json({ success:false, message:'File tidak ditemukan di server.' });
    }
    req.params.id = entry.id;
    return handleStorageDownload(req, res);
  } catch (err: any) {
    return res.status(500).json({ success:false, message: err?.message || 'Gagal mengakses file.' });
  }
}

export async function handleStorageDownload(req: Request, res: Response) {
  try {
    if (!req.headers['x-session-id'] && req.query.sessionId) {
      req.headers['x-session-id'] = String(req.query.sessionId);
    }
    if (!req.headers.authorization && req.query.token) {
      req.headers.authorization = `Bearer ${String(req.query.token)}`;
    }
    if (!req.headers['x-soegiri-auth-uid'] && req.query.uid) {
      req.headers['x-soegiri-auth-uid'] = String(req.query.uid);
    }
    if (!req.headers['x-user-username'] && req.query.username) {
      req.headers['x-user-username'] = String(req.query.username);
    }

    let session: any = null;
    try {
      session = await verifyServerSession(req);
    } catch {
      session = null;
    }

    const rawParam = String(req.params.id || '');
    let decodedId = rawParam;
    try { decodedId = decodeURIComponent(rawParam); } catch {}
    const requestedId = decodedId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const baseId = path.basename(requestedId, path.extname(requestedId));
    const metaMap = ensureStorageDir();
    let meta = metaMap[requestedId] || metaMap[baseId];

    // If metadata doesn't exist or points to a non-existent file on disk, probe disk directly
    const metaFileExists = meta && meta.filename && fs.existsSync(path.join(STORAGE_DIR, meta.filename));
    if (!meta || !metaFileExists) {
      const isOldFile = requestedId.includes('oldFile') || requestedId.includes('legacy');
      const isSignedScan = requestedId.includes('signedScan') || requestedId.includes('scan');

      const candidates: string[] = [
        requestedId,
        `${requestedId}.pdf`,
        `${requestedId}.png`,
        `${requestedId}.jpg`
      ];

      if (isOldFile) {
        candidates.push(`${baseId}.pdf`, `${baseId}_oldFile.pdf`);
      } else if (isSignedScan) {
        candidates.push(`${baseId}.pdf`, `${baseId}_signedScan.pdf`);
      } else {
        candidates.push(
          baseId,
          `${baseId}.pdf`,
          `${baseId}_file.pdf`,
          `${baseId}.png`,
          `${baseId}.jpg`
        );
      }
      for (const cand of candidates) {
        const p = path.join(STORAGE_DIR, cand);
        if (fs.existsSync(p)) {
          const stat = fs.statSync(p);
          if (stat.isFile()) {
            const ext = path.extname(cand);
            const lowerExt = ext.toLowerCase();
            meta = {
              id: baseId,
              originalName: cand,
              mimeType: lowerExt === '.png' ? 'image/png' : lowerExt === '.jpg' || lowerExt === '.jpeg' ? 'image/jpeg' : 'application/pdf',
              size: stat.size,
              uploadedAt: stat.mtime.toISOString(),
              filename: cand,
              resourceType: 'SPO',
              ownerUid: 'admin-root',
              accessKeys: ['ALL'],
              storagePath: `sidokter/spo/${cand}`
            };
            metaMap[baseId] = meta;
            metaMap[requestedId] = meta;
            saveMeta(metaMap);
            break;
          }
        }
      }
    }

    // If not found, attempt on-demand recovery from Firestore
    if (!meta || !meta.filename || !fs.existsSync(path.join(STORAGE_DIR, meta.filename))) {
      meta = await recoverOrSynthesizeFile(requestedId, baseId);
    }

    // No metadata = no authorization decision = fail closed.
    if (!meta || !meta.filename || !fs.existsSync(path.join(STORAGE_DIR, meta.filename))) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan di server.' });
    }

    // Institutional hospital reference documents (SPO, SK, MOU) are open to institutional viewers
    const isInstitutionalDoc = 
      meta.resourceType === 'SPO' ||
      meta.resourceType === 'SK' ||
      meta.resourceType === 'MOU' ||
      (Array.isArray(meta.accessKeys) && meta.accessKeys.includes('ALL')) ||
      requestedId.startsWith('sop-') ||
      requestedId.startsWith('library_') ||
      requestedId.startsWith('sk-') ||
      requestedId.startsWith('mou-');

    if (!isInstitutionalDoc) {
      if (!session) {
        return res.status(401).json({
          success: false,
          code: 'SESSION_EXPIRED',
          message: 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.'
        });
      }

      const isAdmin = session.role === 'admin';
      const isStructural = session.badges?.some((b: any) => String(b).trim().toUpperCase() === 'STRUKTURAL');
      const allowed = isAdmin || isStructural || meta.ownerUid === session.authUid;

      if (!allowed) {
        const sessionKeys = new Set<string>();
        const assignments = Array.isArray(session.assignments) && session.assignments.length
          ? session.assignments
          : (Array.isArray(session.divisionCodes) ? session.divisionCodes.map((divisionCode: any) => ({ divisionCode })) : [{ divisionCode: session.divisionCode }]);
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
        if (!meta.accessKeys?.some((key: string) => sessionKeys.has(key))) {
          return res.status(403).json({ success: false, message: 'Akses dokumen ditolak.' });
        }
      }
    }

    const diskPath = path.join(STORAGE_DIR, meta.filename);
    const stat = fs.statSync(diskPath);
    const totalSize = stat.size;
    const contentType = meta.mimeType || 'application/pdf';

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.originalName || 'dokumen.pdf')}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Handle HTTP Range requests for smooth PDF streaming
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (isNaN(start) || start >= totalSize || (end !== undefined && end >= totalSize) || start > end) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }

      const chunkSize = (end - start) + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', chunkSize);
      const stream = fs.createReadStream(diskPath, { start, end });
      stream.pipe(res);
    } else {
      res.setHeader('Content-Length', totalSize);
      res.status(200);
      fs.createReadStream(diskPath).pipe(res);
    }
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
