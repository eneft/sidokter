'use strict';

const { getApp, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');

const FIRESTORE_DATABASE_ID = 'ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3';
const META_COLLECTION = 'system_config';
const META_DOC = 'hierarchy_master';
const CHUNK_COLLECTION = 'hierarchy_master_chunks';
const FORMAT = 'chunked-json-base64-v1';
const RAW_CHUNK_BYTES = 480 * 1024;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;

function ensureInitialized() {
  try {
    return getApp();
  } catch (error) {
    if (error?.code !== 'app/no-app') throw error;
    return initializeApp();
  }
}

let _db = null;
function getDb() {
  if (!_db) _db = getFirestore(ensureInitialized(), FIRESTORE_DATABASE_ID);
  return _db;
}

function json(res, status, payload) {
  return res.status(status).set('Cache-Control', 'no-store').json(payload);
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || '').trim();
  res.set('Access-Control-Allow-Origin', origin || '*');
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id, X-Soegiri-Session-Id, X-Soegiri-Auth-Uid, X-User-Username');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

async function resolveUser(uid, username) {
  const db = getDb();
  if (uid) {
    const direct = await db.collection('users').doc(uid).get();
    if (direct.exists) return { id: direct.id, data: direct.data() || {} };
  }
  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (normalizedUsername) {
    const snap = await db.collection('users').where('username', '==', normalizedUsername).limit(1).get();
    if (!snap.empty) {
      const userDoc = snap.docs[0];
      return { id: userDoc.id, data: userDoc.data() || {} };
    }
  }
  return null;
}

async function requireHierarchyAuth(req) {
  const header = String(req.headers.authorization || '');
  let decoded = null;
  if (header.startsWith('Bearer ')) {
    try {
      decoded = await getAuth(ensureInitialized()).verifyIdToken(header.slice(7));
    } catch (error) {
      console.warn('[hierarchyApiV2] Bearer verification notice:', error?.code || error?.message || error);
    }
  }

  let uid = String(decoded?.uid || req.headers['x-soegiri-auth-uid'] || req.body?.authUid || '').trim();
  const username = String(req.headers['x-user-username'] || req.body?.username || '').trim().toLowerCase();
  const sessionId = String(decoded?.sessionId || req.headers['x-session-id'] || req.headers['x-soegiri-session-id'] || req.body?.sessionId || '').trim();

  const user = await resolveUser(uid, username);
  if (!user) throw new Error('USER_NOT_FOUND');
  uid = user.id;
  if (!sessionId) throw new Error('SESSION_REQUIRED');

  const sessionSnap = await getDb().collection('session_states').doc(uid).collection('sessions').doc(sessionId).get();
  if (!sessionSnap.exists || sessionSnap.data()?.revoked === true) throw new Error('SESSION_REVOKED');

  const createdAt = Number(sessionSnap.data()?.createdAt || 0);
  if (createdAt > 0 && Date.now() - createdAt > ABSOLUTE_SESSION_MS) throw new Error('SESSION_EXPIRED');

  return { uid, user: user.data, sessionId };
}

function normalizeCategories(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => {
        const na = Number(a), nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      })
      .map((key) => value[key])
      .filter(Boolean);
  }
  return [];
}

function encodeChunks(categories) {
  const raw = Buffer.from(JSON.stringify(categories), 'utf8');
  if (raw.length > MAX_PAYLOAD_BYTES) {
    const error = new Error('HIERARCHY_TOO_LARGE');
    error.statusCode = 413;
    throw error;
  }
  const chunks = [];
  for (let offset = 0, index = 0; offset < raw.length; offset += RAW_CHUNK_BYTES, index += 1) {
    chunks.push({ index, data: raw.subarray(offset, Math.min(offset + RAW_CHUNK_BYTES, raw.length)).toString('base64') });
  }
  return { raw, chunks };
}

async function readHierarchy() {
  const db = getDb();
  const metaSnap = await db.collection(META_COLLECTION).doc(META_DOC).get();
  if (!metaSnap.exists) return { source: 'empty', categories: [] };

  const meta = metaSnap.data() || {};
  if (meta.format === FORMAT) {
    const chunksSnap = await db.collection(CHUNK_COLLECTION).get();
    const docs = chunksSnap.docs
      .map((chunkDoc) => chunkDoc.data() || {})
      .filter((item) => Number.isInteger(item.index) && typeof item.data === 'string')
      .sort((a, b) => a.index - b.index);

    const expected = Number(meta.chunkCount || 0);
    if (expected !== docs.length) throw new Error('HIERARCHY_CHUNK_MISMATCH');
    const raw = Buffer.concat(docs.map((item) => Buffer.from(item.data, 'base64')));
    const categories = normalizeCategories(JSON.parse(raw.toString('utf8')));
    return { source: 'firestore-chunked', categories };
  }

  return { source: 'firestore-legacy', categories: normalizeCategories(meta.value) };
}

async function writeHierarchy(categories, actor) {
  const db = getDb();
  const { raw, chunks } = encodeChunks(categories);
  const existingChunks = await db.collection(CHUNK_COLLECTION).get();
  const now = new Date().toISOString();
  const batch = db.batch();

  existingChunks.docs.forEach((chunkDoc) => batch.delete(chunkDoc.ref));
  chunks.forEach((chunk) => {
    const id = `chunk-${String(chunk.index).padStart(4, '0')}`;
    batch.set(db.collection(CHUNK_COLLECTION).doc(id), { id, index: chunk.index, format: FORMAT, data: chunk.data, updatedAt: now });
  });

  batch.set(db.collection(META_COLLECTION).doc(META_DOC), {
    id: META_DOC,
    format: FORMAT,
    chunkCount: chunks.length,
    categoryCount: categories.length,
    byteLength: raw.length,
    updatedAt: now,
    updatedBy: actor,
    value: FieldValue.delete()
  }, { merge: true });
  await batch.commit();
  return { chunkCount: chunks.length, byteLength: raw.length };
}

const hierarchyApiV2 = onRequest({ region: 'asia-southeast2', invoker: 'public', timeoutSeconds: 60, memory: '512MiB' }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const result = await readHierarchy();
      return json(res, 200, { success: true, source: result.source, categories: result.categories });
    }
    if (req.method !== 'POST') return json(res, 405, { success: false, message: 'Method tidak diizinkan.' });

    const context = await requireHierarchyAuth(req);
    const role = normalizeRole(context.user.role);
    const structural = Array.isArray(context.user.badges) && context.user.badges.some((badge) => String(badge).trim().toUpperCase() === 'STRUKTURAL');
    if (role !== 'admin' && !structural) return json(res, 403, { success: false, message: 'Akses menyimpan Master Hirarki ditolak.' });

    const categories = normalizeCategories(req.body?.categories);
    if (!categories.length) return json(res, 400, { success: false, message: 'Data kategori tidak boleh kosong.' });

    const actor = String(req.body?.updatedBy || context.user.username || context.uid || 'admin');
    const stored = await writeHierarchy(categories, actor);
    return json(res, 200, {
      success: true,
      firestoreSynced: true,
      count: categories.length,
      chunkCount: stored.chunkCount,
      byteLength: stored.byteLength,
      source: 'trusted-chunked-v2',
      message: `Hierarki dengan ${categories.length} kategori berhasil disimpan.`
    });
  } catch (error) {
    console.error('[hierarchyApiV2]', error);
    const code = String(error?.message || 'HIERARCHY_ERROR');
    const authError = ['USER_NOT_FOUND', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_REQUIRED'].includes(code);
    const status = Number(error?.statusCode || (authError ? 401 : 500));
    const message = code === 'HIERARCHY_TOO_LARGE'
      ? 'Data Master Hirarki terlalu besar untuk diproses.'
      : authError
        ? 'Sesi login tidak valid atau sudah berakhir. Silakan login kembali.'
        : code === 'HIERARCHY_CHUNK_MISMATCH'
          ? 'Data Master Hirarki di server tidak lengkap. Silakan simpan ulang dari Administrator.'
          : 'Gagal mengakses Master Hirarki.';
    return json(res, status, { success: false, code, message });
  }
});

module.exports = { hierarchyApiV2 };
