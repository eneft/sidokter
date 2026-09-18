const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { initializeApp, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { assertReviewTransition } = require('./sopReviewPolicy');
const { assertMailReply } = require('./internalMailPolicy');
const { resolveSopOwnerUid, buildRevisionRequestNotification } = require('./sopReviewOwnership');

if (!process.env.AWS_EXECUTION_ENV) {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
}

let chromiumModulePromise = null;
let cachedStandardCss = null;
let cachedBookmanCss = null;

function getBookmanFontFaceCss() {
  if (cachedBookmanCss) return cachedBookmanCss;

  const fontsDir = path.join(__dirname, 'fonts');
  const readFont = (filename) => {
    const file = path.join(fontsDir, filename);
    if (!fs.existsSync(file)) {
      throw new Error(`PDF_BOOKMAN_FONT_MISSING:${filename}`);
    }
    return `data:font/otf;base64,${fs.readFileSync(file).toString('base64')}`;
  };

  cachedBookmanCss = `
@font-face{font-family:"Bookman Old Style";src:url("${readFont('URWBookman-Light.otf')}") format("opentype");font-style:normal;font-weight:400;font-display:block;}
@font-face{font-family:"Bookman Old Style";src:url("${readFont('URWBookman-Demi.otf')}") format("opentype");font-style:normal;font-weight:700;font-display:block;}
@font-face{font-family:"Bookman Old Style";src:url("${readFont('URWBookman-LightItalic.otf')}") format("opentype");font-style:italic;font-weight:400;font-display:block;}
@font-face{font-family:"Bookman Old Style";src:url("${readFont('URWBookman-DemiItalic.otf')}") format("opentype");font-style:italic;font-weight:700;font-display:block;}
`;
  return cachedBookmanCss;
}

// PDF-only normalization: remove editor inline font-family declarations so
// imported/rich-text content cannot override the official Bookman contract.
function normalizePdfFontStyles(html) {
  return String(html || '').replace(/(style\s*=\s*["'])(.*?)(["'])/gis, (full, open, styles, close) => {
    const cleaned = styles
      .replace(/(?:^|;)\s*font-family\s*:[^;]*;?/gi, ';')
      .replace(/;;+/g, ';')
      .replace(/^\s*;|;\s*$/g, '')
      .trim();
    return `${open}${cleaned}${close}`;
  });
}

async function getServerlessChromium() {
  if (!chromiumModulePromise) {
    chromiumModulePromise = (async () => {
      const mod = await import('@sparticuz/chromium');
      const chromium = mod.default || mod;

      const al2023Lib = path.join(os.tmpdir(), 'al2023', 'lib');
      const nsprPath = path.join(al2023Lib, 'libnspr4.so');

      if (!fs.existsSync(nsprPath) && typeof mod.inflate === 'function') {
        try {
          let binDir;
          try {
            binDir = path.join(path.dirname(require.resolve('@sparticuz/chromium/package.json')), 'bin');
          } catch {
            binDir = path.join(process.cwd(), 'node_modules', '@sparticuz/chromium', 'bin');
          }
          const al2023Tar = path.join(binDir, 'al2023.tar.br');
          if (fs.existsSync(al2023Tar)) {
            console.log('[PDF] Inflating AL2023 libraries for Linux Cloud Functions...');
            await mod.inflate(al2023Tar);
          }
        } catch (err) {
          console.warn('[PDF] Failed to manually inflate al2023:', err);
        }
      }

      if (typeof mod.setupLambdaEnvironment === 'function') {
        mod.setupLambdaEnvironment(al2023Lib);
      }

      const currentLd = process.env.LD_LIBRARY_PATH || '';
      const pathsToAdd = [al2023Lib, '/lib/x86_64-linux-gnu', '/usr/lib/x86_64-linux-gnu'];
      const combinedLd = [...new Set([...pathsToAdd, ...currentLd.split(':')])].filter(Boolean).join(':');
      process.env.LD_LIBRARY_PATH = combinedLd;

      return chromium;
    })();
  }
  return chromiumModulePromise;
}

function ensureInitialized() {
  // Always resolve the DEFAULT Firebase Admin app. Checking getApps().length
  // is not sufficient because a named app can exist while [DEFAULT] does not.
  try {
    return getApp();
  } catch (error) {
    if (error?.code !== 'app/no-app') throw error;
    // In Google Cloud Functions/Cloud Run, initializeApp() without an explicit
    // credential uses Application Default Credentials from the runtime service
    // account. This avoids shipping or loading a JSON key into the function.
    return initializeApp({
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'sidokter-soegiri.firebasestorage.app'
    });
  }
}

function getAuthSafe() {
  return getAuth(ensureInitialized());
}

// SIDOKTER uses a named Firestore Enterprise database; do not fall back to (default).
const FIRESTORE_DATABASE_ID = 'ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3';
const AUTH_API_BUILD = 'firebase-migration-fix-v5';
let _db = null;
function getFirestoreInstance() {
  if (!_db) {
    ensureInitialized();
    _db = getFirestore(FIRESTORE_DATABASE_ID);
  }
  return _db;
}

// Transparent lazy Proxy: zero network/connection activity during CLI triggers extraction
const db = new Proxy({}, {
  get(target, prop) {
    const instance = getFirestoreInstance();
    const val = instance[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  }
});
const USERS = 'users';
const USER_CREDENTIALS = 'user_credentials';
const AUTH_LOGS = 'auth_logs';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_MAX = 12;
const loginRate = new Map();

function json(res, status, payload) {
  res.status(status).set('Cache-Control', 'no-store').json(payload);
}

function cors(req, res) {
  const origin = String(req.headers.origin || '');
  const configured = String(process.env.AUTH_ALLOWED_ORIGINS || process.env.AUTH_ALLOWED_ORIGIN || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'sidokter-soegiri';
  const builtIn = new RegExp(`^https://(?:sidokter-soegiri|${projectId})\\.(?:web\\.app|firebaseapp\\.com)$`);
  const vercel = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
  const local = /^http:\/\/localhost:\d+$/;
  if (origin && (configured.includes(origin) || builtIn.test(origin) || local.test(origin) || vercel.test(origin) || origin.endsWith('.run.app') || origin.includes('sidokter-soegiri'))) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id, X-Soegiri-Session-Id, X-Soegiri-Auth-Uid, X-User-Username');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function safeEqualHex(a, b) {
  try {
    const aa = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function verifyPassword(password, storedHash, storedSalt) {
  if (!storedHash || !storedSalt) return false;
  const derived = crypto.pbkdf2Sync(password, Buffer.from(storedSalt, 'hex'), PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
  return safeEqualHex(derived, storedHash);
}

async function findUser(username) {
  const snap = await db.collection(USERS).where('username', '==', username).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, data: d.data() };
}

let initialCredentials = {};
try {
  initialCredentials = require('./initial_credentials.json');
} catch {
  initialCredentials = {};
}

async function getCredential(userId, legacyUserData = null) {
  const ref = db.collection(USER_CREDENTIALS).doc(userId);
  const snap = await ref.get();
  if (snap.exists) return { ref, data: snap.data() };

  // Seamless migration from initial credentials
  const seedCred = initialCredentials[userId] || ((userId === 'admin' || legacyUserData?.username === 'admin') ? initialCredentials['admin-root'] : null);
  if (seedCred?.passwordHash && seedCred?.passwordSalt) {
    const data = {
      passwordHash: seedCred.passwordHash,
      passwordSalt: seedCred.passwordSalt,
      updatedAt: seedCred.updatedAt || new Date().toISOString()
    };
    await ref.set(data, { merge: true });
    return { ref, data };
  }

  // Secure one-time migration for installations that still have credentials
  // embedded in the legacy users document. The browser never receives them.
  if (legacyUserData?.passwordHash && legacyUserData?.passwordSalt) {
    const data = { passwordHash: legacyUserData.passwordHash, passwordSalt: legacyUserData.passwordSalt, updatedAt: new Date().toISOString() };
    await ref.set(data, { merge: true });
    await db.collection(USERS).doc(userId).update({
      passwordHash: FieldValue.delete(),
      passwordSalt: FieldValue.delete(),
      password: FieldValue.delete()
    });
    return { ref, data };
  }
  if (typeof legacyUserData?.password === 'string' && legacyUserData.password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(legacyUserData.password, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
    const data = { passwordHash: hash, passwordSalt: salt.toString('hex'), updatedAt: new Date().toISOString() };
    await ref.set(data, { merge: true });
    await db.collection(USERS).doc(userId).update({
      passwordHash: FieldValue.delete(),
      passwordSalt: FieldValue.delete(),
      password: FieldValue.delete()
    });
    return { ref, data };
  }
  return { ref, data: null };
}

async function audit(data) {
  try {
    const id = `log-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    await db.collection(AUTH_LOGS).doc(id).set({
      ...data,
      id,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('audit write failed', e);
  }
}

function publicSession(user, sessionId, createdAt) {
  return {
    authUid: user.id,
    username: user.data.username,
    name: user.data.name,
    role: normalizeRole(user.data.role),
    sessionId,
    sessionCreatedAt: createdAt,
    lastActiveAt: createdAt,
    unitName: user.data.unitName || 'Unit Kerja RSUD Dr. Soegiri',
    divisionCode: user.data.divisionCode || (normalizeRole(user.data.role) === 'admin' ? 'ALL' : 'PEL'),
    subCode: user.data.subCode,
    instCode: user.data.instCode,
    poliCode: user.data.poliCode,
    subUnitCode: user.data.subUnitCode,
    divisionCodes: Array.isArray(user.data.divisionCodes) ? user.data.divisionCodes : undefined,
    assignments: Array.isArray(user.data.assignments) ? user.data.assignments : undefined,
    badges: Array.isArray(user.data.badges) ? user.data.badges : []
  };
}

async function createSession(uid, sessionId, createdAt, metadata = {}) {
  await db.collection('session_states').doc(uid).collection('sessions').doc(sessionId).set({
    sessionId, createdAt, lastActiveAt: createdAt, revoked: false, ...metadata
  });
}

async function getActiveSession(uid, sessionId) {
  if (!sessionId) return null;
  const snap = await db.collection('session_states').doc(uid).collection('sessions').doc(sessionId).get();
  return snap.exists && snap.data()?.revoked !== true ? snap.data() : null;
}

async function revokeAllSessions(uid) {
  const ref = db.collection('session_states').doc(uid).collection('sessions');
  const snap = await ref.get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach(d => batch.update(d.ref, { revoked: true, revokedAt: new Date().toISOString() }));
  await batch.commit();
}

async function revokeSession(uid, sessionId) {
  if (!sessionId) return;
  await db.collection('session_states').doc(uid).collection('sessions').doc(sessionId).set({ revoked: true, revokedAt: new Date().toISOString() }, { merge: true });
}

async function requireAuth(req) {
  const header = String(req.headers.authorization || '');
  let decoded = null;
  let uid = null;

  if (header.startsWith('Bearer ')) {
    try {
      decoded = await getAuthSafe().verifyIdToken(header.slice(7).trim(), true);
      uid = decoded.uid;
    } catch (e) {
      // A Firebase ID token is optional for SIDOKTER's server-authoritative
      // session flow. If verification fails, continue using the session ID.
      console.warn('ID token verification notice:', e?.message || e);
    }
  }

  const sessionId = String(
    decoded?.sessionId || req.headers['x-session-id'] || req.headers['x-soegiri-session-id'] || req.body?.sessionId || ''
  ).trim();
  const headerUid = String(req.headers['x-soegiri-auth-uid'] || req.headers['x-user-id'] || req.body?.authUid || '').trim();

  if (!uid && headerUid) uid = headerUid;

  // Important: storage preview/download may only have X-Session-Id because a
  // browser cannot attach custom headers to window.open()/an iframe URL. Resolve
  // the UID from the existing server-side session instead of creating a new one.
  if (!uid && sessionId) {
    try {
      const sessionSnap = await db.collectionGroup('sessions')
        .where('sessionId', '==', sessionId)
        .limit(5)
        .get();
      const match = sessionSnap.docs.find(doc => doc.data()?.revoked !== true);
      const parent = match?.ref.parent?.parent;
      if (match && parent) uid = parent.id;
    } catch (sessionLookupErr) {
      console.warn('Session UID lookup notice:', sessionLookupErr?.message || sessionLookupErr);
    }
  }

  if (!uid && req.headers['x-user-username']) {
    const foundUser = await findUser(normalizeUsername(req.headers['x-user-username']));
    if (foundUser) uid = foundUser.id;
  }

  if (!uid) {
    const err = new Error('UNAUTHENTICATED');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }
  if (!sessionId) {
    const err = new Error('SESSION_REQUIRED');
    err.code = 'SESSION_REQUIRED';
    throw err;
  }

  const userRef = db.collection(USERS).doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const user = { ...snap.data(), role: normalizeRole(snap.data().role) };

  // Never auto-create a session during an authenticated API request. Sessions
  // are created only by the login flow; every protected endpoint must validate
  // an already-existing, non-revoked session.
  const active = await getActiveSession(uid, sessionId);
  if (!active || active.revoked === true) {
    const err = new Error('SESSION_REVOKED');
    err.code = 'SESSION_REVOKED';
    throw err;
  }

  return {
    decoded: decoded || { uid, role: user.role, sessionId },
    ref: userRef,
    user,
    session: active
  };
}

function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.ip || 'unknown');
}

async function countAdmins() {
  const snap = await db.collection(USERS).limit(500).get();
  return snap.docs.some(d => normalizeRole(d.data()?.role) === 'admin');
}

function validStrongPassword(password) {
  return typeof password === 'string' && password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function normalizeHierarchyCode(value) {
  return String(value || '').trim().replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
}

function getSopAccessKeysServer(sop) {
  const division = String(sop?.divisionCode || '').trim().toUpperCase();
  if (!division) return [];
  const hierarchy = normalizeHierarchyCode(
    sop?.subHierarchyCode ||
    [sop?.subCode, sop?.instalasiCode || sop?.instCode, sop?.poliCode, sop?.subUnitCode].filter(Boolean).join('.') ||
    String(sop?.sopNumber || '').split('/')[1]?.trim()
  );
  const keys = [division];
  if (hierarchy) {
    const parts = hierarchy.split('.').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) keys.push(`${division}|${parts.slice(0, i).join('.')}`);
  }
  return Array.from(new Set(keys));
}

function getUserHierarchyClaims(user) {
  const role = normalizeRole(user?.role);
  if (role === 'admin') return { hierarchyKeys: [], globalHierarchyAccess: true };
  const assignments = Array.isArray(user?.assignments) && user.assignments.length
    ? user.assignments
    : (Array.isArray(user?.divisionCodes) && user.divisionCodes.length
      ? user.divisionCodes.map((divisionCode, index) => ({
          divisionCode,
          subCode: index === 0 ? user.subCode : undefined,
          instCode: index === 0 ? user.instCode : undefined,
          poliCode: index === 0 ? user.poliCode : undefined,
          subUnitCode: index === 0 ? user.subUnitCode : undefined
        }))
      : [{ divisionCode: user?.divisionCode || 'PEL', subCode: user?.subCode, instCode: user?.instCode, poliCode: user?.poliCode, subUnitCode: user?.subUnitCode }]);
  // `ALL` is a legitimate global hierarchy assignment for a User account.
  // It is a scope marker, not a document access-key value. Therefore it must
  // set the global claim instead of being discarded from the assignment list.
  if (assignments.some((a) => String(a?.divisionCode || '').trim().toUpperCase() === 'ALL')) {
    return { hierarchyKeys: [], globalHierarchyAccess: true };
  }

  const keys = new Set();
  for (const a of assignments) {
    const division = String(a?.divisionCode || '').trim().toUpperCase();
    if (!division || division === 'ALL') continue;
    keys.add(division);
    const rawHierarchy = a?.hierarchyCode || [a?.subCode, a?.instCode, a?.poliCode, a?.subUnitCode].filter(Boolean).join('.');
    const hierarchy = normalizeHierarchyCode(rawHierarchy);
    if (hierarchy) {
      const parts = hierarchy.split('.').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        keys.add(`${division}|${parts.slice(0, i).join('.')}`);
      }
    }
  }
  // Do not truncate the authorization scope. Firestore queries are already
  // batched at <=30 values, but every batch must still be covered by the
  // authenticated user's claim; truncating here caused later query batches to
  // fail Firestore Rules with "Missing or insufficient permissions" on a
  // fresh device that had no local cache.
  return { hierarchyKeys: Array.from(keys), globalHierarchyAccess: false };
}


function sopScopeFingerprint(hierarchyClaims) {
  const payload = JSON.stringify({
    keys: Array.from(new Set(hierarchyClaims?.hierarchyKeys || [])).sort(),
    global: hierarchyClaims?.globalHierarchyAccess === true
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function reconcileSopReadIndexForUser(uid, user, force = false) {
  const claims = getUserHierarchyClaims(user);
  const fingerprint = sopScopeFingerprint(claims);
  if (!force && String(user?.sopReadIndexFingerprint || '') === fingerprint && Number(user?.sopReadIndexVersion || 0) >= 4) {
    return { changed: false, fingerprint };
  }

  const userKeys = new Set(claims.hierarchyKeys || []);
  const global = claims.globalHierarchyAccess === true;
  const snap = await db.collection('sops').get();
  let batch = db.batch();
  let writes = 0;
  let changed = 0;
  const commitIfNeeded = async () => {
    if (writes) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  };

  for (const d of snap.docs) {
    const data = d.data() || {};
    if (data.isNumberReservation) continue;
    const accessKeys = new Set(Array.isArray(data.accessKeys) ? data.accessKeys.map(v => String(v).trim().toUpperCase()).filter(Boolean) : getSopAccessKeysServer(data));
    const shouldHave = global || Array.from(accessKeys).some(k => userKeys.has(k));
    const current = Array.isArray(data.authorizedUids) ? data.authorizedUids.map(String) : [];
    const has = current.includes(String(uid));
    if (shouldHave && !has) {
      batch.update(d.ref, { authorizedUids: FieldValue.arrayUnion(String(uid)), accessBoundaryVersion: 4 });
      writes++; changed++;
    } else if (!shouldHave && has) {
      batch.update(d.ref, { authorizedUids: FieldValue.arrayRemove(String(uid)), accessBoundaryVersion: 4 });
      writes++; changed++;
    }
    if (writes >= 450) await commitIfNeeded();
  }
  await commitIfNeeded();
  await db.collection(USERS).doc(uid).set({
    sopAccessKeys: claims.hierarchyKeys,
    sopGlobalAccess: claims.globalHierarchyAccess,
    sopReadIndexFingerprint: fingerprint,
    sopReadIndexVersion: 4
  }, { merge: true });
  return { changed: changed > 0, fingerprint, changedDocs: changed };
}

async function migrateSopAccessBoundary(req, res, context) {
  if (context.user.role !== 'admin') return json(res, 403, { message: 'Hanya Administrator yang dapat menjalankan migrasi keamanan dokumen.' });
  const versionRef = db.collection('system_config').doc('security_sop_access');
  const versionSnap = await versionRef.get();
  if (versionSnap.exists && Number(versionSnap.data()?.version || 0) >= 2) {
    return json(res, 200, { success: true, migrated: 0, alreadyCurrent: true });
  }
  const snap = await db.collection('sops').get();
  let migrated = 0;
  let batch = db.batch();
  let batchCount = 0;
  for (const d of snap.docs) {
    const data = d.data() || {};
    if (data.isNumberReservation) continue;
    const accessKeys = getSopAccessKeysServer(data);
    if (!accessKeys.length) continue;
    const current = Array.isArray(data.accessKeys) ? data.accessKeys : [];
    const same = current.length === accessKeys.length && current.every((v, i) => v === accessKeys[i]);
    if (same) continue;
    batch.update(d.ref, { accessKeys, accessBoundaryVersion: 2 });
    migrated++;
    batchCount++;
    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount) await batch.commit();
  await versionRef.set({ version: 2, migratedAt: new Date().toISOString(), migratedBy: context.decoded.uid }, { merge: true });
  await audit({ actorUid: context.decoded.uid, username: context.user.username, name: context.user.name, role: context.user.role, event: 'SOP_ACCESS_BOUNDARY_MIGRATED', details: `Migrasi accessKeys SPO selesai: ${migrated} dokumen diperbarui.` });
  return json(res, 200, { success: true, migrated, alreadyCurrent: false });
}

async function bootstrapInitialAdmin(req, res) {
  const setupSecret = String(req.body?.setupSecret || '');
  const password = String(req.body?.password || '');
  const configuredSecret = String(process.env.SIDOKTER_BOOTSTRAP_SECRET || '');
  if (!configuredSecret) return json(res, 503, { message: 'Provisioning Admin belum dikonfigurasi server.' });
  if (!setupSecret || !safeEqualHex(crypto.createHash('sha256').update(setupSecret).digest('hex'), crypto.createHash('sha256').update(configuredSecret).digest('hex'))) {
    await audit({ event: 'ADMIN_BOOTSTRAP_FAILED', details: 'Setup secret tidak valid.' });
    return json(res, 403, { message: 'Setup key tidak valid.' });
  }
  if (!validStrongPassword(password)) {
    return json(res, 400, { message: 'Password Admin minimal 12 karakter dan wajib mengandung huruf besar, huruf kecil, angka, serta simbol.' });
  }
  if (await countAdmins()) return json(res, 409, { message: 'Akun Administrator sudah tersedia. Provisioning pertama telah dikunci.' });

  const username = 'admin';
  const existing = await findUser(username);
  if (existing) return json(res, 409, { message: 'Username admin sudah digunakan. Provisioning dihentikan.' });

  const uid = `admin-${crypto.randomUUID()}`;
  const salt = crypto.randomBytes(16);
  const passwordHash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
  const now = new Date().toISOString();
  await db.collection(USERS).doc(uid).set({
    id: uid, username, name: 'Administrator SIDOKTER', role: 'admin', divisionCode: 'ALL', divisionCodes: ['ALL'], assignments: [], badges: [],
    unitName: 'RSUD Dr. Soegiri Lamongan', createdAt: now, updatedAt: now, credentialStatus: 'ACTIVE',
    failedLoginAttempts: 0, lockoutUntil: 0
  });
  await db.collection(USER_CREDENTIALS).doc(uid).set({ passwordHash, passwordSalt: salt.toString('hex'), updatedAt: now });
  await audit({ username, name: 'Administrator SIDOKTER', role: 'admin', event: 'ADMIN_BOOTSTRAPPED', details: 'Administrator pertama berhasil diprovision melalui one-time server-side setup.' });
  return json(res, 201, { success: true, message: 'Administrator pertama berhasil dibuat. Provisioning berikutnya otomatis terkunci.', username });
}

function checkLoginRate(req, username) {
  const key = `${requestIp(req)}:${username}`;
  const now = Date.now();
  const current = loginRate.get(key);
  if (!current || current.resetAt <= now) {
    loginRate.set(key, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS });
    return { allowed: true };
  }
  if (current.count >= LOGIN_RATE_MAX) {
    return { allowed: false, retryAfter: Math.ceil((current.resetAt - now) / 60000) };
  }
  current.count += 1;
  return { allowed: true };
}



// Server-authoritative notification writer. Clients may only create a notification
// for their own authenticated UID; Firestore rules deny direct client creation.
exports.createNotification = onCall({ region: 'asia-southeast2', timeoutSeconds: 15, memory: '256MiB' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Login diperlukan.');
  const item = request.data?.item;
  if (!item || typeof item !== 'object') throw new HttpsError('invalid-argument', 'Notification item tidak valid.');
  const allowedTypes = new Set(['activation', 'proposal', 'assignment', 'review', 'success', 'info', 'warning', 'error']);
  if (!allowedTypes.has(String(item.type))) throw new HttpsError('invalid-argument', 'Tipe notification tidak valid.');
  const eventKey = String(item.metadata?.eventKey || item.id || '').trim();
  if (!eventKey || eventKey.length > 300) throw new HttpsError('invalid-argument', 'eventKey wajib dan valid.');
  // Deterministic document ID based on eventKey: path /notifications/{UID}/items/{eventKey}
  const id = eventKey.replace(/\//g, '_').slice(0, 150);

  const safe = {
    id,
    type: String(item.type),
    title: String(item.title || '').slice(0, 200),
    message: String(item.message || '').slice(0, 2000),
    documentId: item.documentId ? String(item.documentId) : undefined,
    documentNumber: item.documentNumber ? String(item.documentNumber) : undefined,
    documentType: item.documentType === 'SPO' || item.documentType === 'SK' || item.documentType === 'MOU' ? item.documentType : undefined,
    divisionCode: item.divisionCode ? String(item.divisionCode) : undefined,
    divisionName: item.divisionName ? String(item.divisionName) : undefined,
    subHierarchyCode: item.subHierarchyCode ? String(item.subHierarchyCode) : undefined,
    dueDate: item.dueDate ? String(item.dueDate) : undefined,
    isOverdue: Boolean(item.isOverdue),
    timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now(),
    read: false,
    hidden: false,
    metadata: { eventKey, internalMailVersion: 1 }
  };
  Object.keys(safe).forEach((key) => safe[key] === undefined && delete safe[key]);

  const ref = db.collection('notifications').doc(uid).collection('items').doc(id);
  try {
    await ref.set(safe, { merge: true });
  } catch (error) {
    throw new HttpsError('internal', `Gagal menyimpan notification: ${error?.message || error}`);
  }
  return { ok: true, id };
});

// Replies are routed exclusively from the authenticated user's source mail.
// The client never supplies a recipient or sender identity.
exports.replyInternalMail = onCall({ region: 'asia-southeast2', timeoutSeconds: 15, memory: '256MiB' }, async (request) => {
  const actorUid = request.auth?.uid;
  if (!actorUid) throw new HttpsError('unauthenticated', 'Login diperlukan.');
  const sourceId = String(request.data?.sourceNotificationId || '').trim();
  const body = String(request.data?.body || '').trim();
  if (!sourceId || !body || body.length > 2000) throw new HttpsError('invalid-argument', 'Isi balasan wajib diisi dan maksimal 2.000 karakter.');

  const [actorSnap, sourceSnap] = await Promise.all([
    db.collection('users').doc(actorUid).get(),
    db.collection('notifications').doc(actorUid).collection('items').doc(sourceId).get()
  ]);
  if (!actorSnap.exists || !sourceSnap.exists) throw new HttpsError('permission-denied', 'Pesan tidak dapat dibalas.');
  const sourceMail = sourceSnap.data() || {};
  const sopId = String(sourceMail.documentId || '').trim();
  const sopSnap = await db.collection('sops').doc(sopId).get();
  if (!sopSnap.exists) throw new HttpsError('not-found', 'SPO terkait tidak ditemukan.');
  const sop = { id: sopSnap.id, ...sopSnap.data() };
  let route;
  try {
    route = assertMailReply({ actorUid, actor: actorSnap.data(), sourceMail, sop, body });
  } catch {
    throw new HttpsError('permission-denied', 'Anda tidak diizinkan membalas pesan ini.');
  }

  const sender = actorSnap.data() || {};
  const recipientSnap = await db.collection('users').doc(route.recipientUid).get();
  if (!recipientSnap.exists) throw new HttpsError('failed-precondition', 'Penerima pesan tidak tersedia.');
  const id = `mail-reply-${crypto.randomUUID()}`;
  const subject = String(sourceMail.title || 'Pesan SPO').replace(/^Re:\s*/i, '');
  const correlationId = String(sourceMail.metadata?.correlationId || sourceMail.metadata?.eventKey || sourceId);
  const reply = {
    id, type: 'review', title: `Re: ${subject}`.slice(0, 200), message: body,
    documentId: sopId, documentNumber: sop.sopNumber || sourceMail.documentNumber || null,
    documentType: 'SPO', timestamp: Date.now(), read: false, hidden: false, actionLabel: 'Buka SPO',
    metadata: {
      eventKey: id, mailKind: 'human', senderUid: actorUid,
      senderName: String(sender.name || sender.username || 'Pengguna SIDOKTER'),
      recipientUid: route.recipientUid,
      recipientName: String(recipientSnap.data()?.name || recipientSnap.data()?.username || 'Pengguna SIDOKTER'),
      documentTitle: String(sop.title || ''), correlationId, replyTo: sourceId, internalMailVersion: 1
    }
  };
  await db.collection('notifications').doc(route.recipientUid).collection('items').doc(id).set(reply);
  return { ok: true, id };
});

// Authoritative, transactional SPO correction workflow. Notification routing is
// performed here so clients can never choose or impersonate a recipient.
exports.sopReviewWorkflow = onCall({ region: 'asia-southeast2', timeoutSeconds: 20, memory: '256MiB' }, async (request) => {
  const requestId = crypto.randomUUID();
  const actorUid = request.auth?.uid;
  if (!actorUid) throw new HttpsError('unauthenticated', 'Login diperlukan.');
  const sopId = String(request.data?.sopId || '').trim();
  const action = String(request.data?.action || '').trim();
  const note = String(request.data?.note || '').trim();
  if (!sopId || !['REQUEST_REVISION', 'SUBMIT_REVISION', 'VERIFY'].includes(action)) {
    throw new HttpsError('invalid-argument', 'Permintaan alur verifikasi tidak valid.');
  }
  if (action === 'REQUEST_REVISION' && !note) {
    throw new HttpsError('invalid-argument', 'Catatan perbaikan wajib diisi.');
  }

  logger.info('SPO review request received', { requestId, action, sopId, actorUid });
  try {
  const actorSnap = await db.collection('users').doc(actorUid).get();
  if (!actorSnap.exists) throw new HttpsError('permission-denied', 'Akun tidak ditemukan.');
  const actor = actorSnap.data() || {};
  const sopRef = db.collection('sops').doc(sopId);
  let notification = null;
  let resultingSop;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sopRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'SPO tidak ditemukan.');
    const sop = snapshot.data() || {};
    if (sop.status !== 'DRAFT') throw new HttpsError('failed-precondition', 'Permintaan perbaikan hanya berlaku untuk SPO DRAFT.');
    const creatorUid = await resolveSopOwnerUid(sop, {
      hasUid: async (uid) => (await transaction.get(db.collection('users').doc(uid))).exists,
      findUidsByUsername: async (username, limit) => {
        const query = db.collection('users').where('username', '==', username).limit(limit);
        const matches = await transaction.get(query);
        return matches.docs.map((doc) => doc.id);
      }
    });
    if (!creatorUid) throw new HttpsError('failed-precondition', 'UID pembuat/pengusul SPO tidak dapat ditentukan.');
    sop.creatorUid = creatorUid;
    const now = new Date().toISOString();
    let nextState;
    let recipientUid;
    let eventNote;
    let transition;
    try {
      transition = assertReviewTransition({ action, actor, actorUid, sop, note });
    } catch (error) {
      const code = ['DRAFT_REQUIRED', 'CREATOR_REQUIRED', 'INVALID_STATE'].includes(error.message) ? 'failed-precondition' : error.message === 'NOTE_REQUIRED' ? 'invalid-argument' : 'permission-denied';
      throw new HttpsError(code, error.message === 'NOTE_REQUIRED' ? 'Catatan perbaikan wajib diisi.' : 'Transisi alur perbaikan tidak diizinkan. Muat ulang dokumen.');
    }
    if (action === 'REQUEST_REVISION') {
      nextState = transition.nextState; recipientUid = transition.recipientUid; eventNote = note;
      notification = { uid: creatorUid, title: 'Perlu Perbaikan SPO', message: note, key: `sop-revision-requested-${sopId}-${Date.now()}`, note, revisionRequest: true };
    } else if (action === 'SUBMIT_REVISION') {
      const requesterUid = String(sop.currentReviewRequesterUid || '').trim();
      nextState = transition.nextState; recipientUid = transition.recipientUid; eventNote = 'Perbaikan telah dikirim.';
      notification = { uid: requesterUid, title: 'Perbaikan SPO Telah Dikirim', message: `${actor.name || actor.username || 'Pengusul'} telah mengirim perbaikan untuk SPO "${sop.title || sop.sopNumber}".`, key: `sop-revision-submitted-${sopId}-${Date.now()}` };
    } else {
      nextState = transition.nextState; recipientUid = transition.recipientUid; eventNote = 'Verifikasi selesai.';
    }
    const entry = { id: crypto.randomUUID(), type: nextState, actorUid, actorName: String(actor.name || actor.username || 'Pengguna'), recipientUid, note: eventNote, createdAt: now };
    const update = { reviewState: nextState, reviewHistory: [...(Array.isArray(sop.reviewHistory) ? sop.reviewHistory : []), entry], reviewUpdatedAt: now, updatedAt: now };
    if (!snapshot.data().creatorUid) update.creatorUid = creatorUid;
    if (action === 'REQUEST_REVISION') update.currentReviewRequesterUid = actorUid;
    transaction.update(sopRef, update);
    resultingSop = { ...sop, id: snapshot.id, ...update };
    if (notification) {
      const notifId = notification.key.replace(/\//g, '_').slice(0, 150);
      const notificationData = notification.revisionRequest
        ? buildRevisionRequestNotification({ id: notifId, eventKey: notification.key, sop: { ...sop, id: sopId }, actorUid, actor, recipientUid: notification.uid, note, timestamp: Date.now() })
        : {
        id: notifId, type: 'review', title: notification.title, message: notification.message,
        documentId: sopId, documentNumber: sop.sopNumber || null, documentType: 'SPO', timestamp: Date.now(), read: false, hidden: false,
        metadata: { eventKey: notification.key, reviewContext: nextState, correctionNote: notification.note || null,
          mailKind: 'human', senderUid: actorUid, senderName: String(actor.name || actor.username || 'Reviewer SIDOKTER'),
          recipientUid: notification.uid, documentTitle: String(sop.title || ''), internalMailVersion: 1 }, actionLabel: 'Buka SPO'
      };
      transaction.set(db.collection('notifications').doc(notification.uid).collection('items').doc(notifId), notificationData);
    }
  });
  // Audit is deliberately outside the workflow transaction: audit failure is
  // non-fatal, while transition, history, and notification commit atomically.
  await audit({ actorUid, username: actor.username, name: actor.name, role: actor.role, event: `SOP_${action}`, details: `SPO ${sopId}: ${resultingSop.reviewState}` });
  logger.info('SPO review request completed', { requestId, action, sopId, actorUid, reviewState: resultingSop.reviewState });
  return { ok: true, sop: resultingSop };
  } catch (error) {
    // Preserve intentional client-safe errors. Unexpected Admin/Firestore
    // details stay in server logs and the reference allows incident tracing.
    logger.error('SPO review request failed', {
      requestId, action, sopId, actorUid,
      errorCode: error?.code || 'unknown',
      errorMessage: error?.message || String(error),
      stack: error?.stack
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', `Alur perbaikan SPO gagal diproses. Referensi: ${requestId}`);
  }
});
exports.authApi = onRequest({ region: 'asia-southeast2', invoker: 'public', timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');

  let authStage = 'request';
  // GET health is intentionally public and read-only so deployment can be
  // verified directly from a browser without sending credentials.
  if (req.method === 'GET') {
    try {
      authStage = 'health-firestore';
      const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'sidokter-soegiri';
      const dbInstance = getFirestoreInstance();
      const probe = await dbInstance.collection(USERS).limit(1).get();
      return json(res, 200, {
        status: 'ok',
        service: 'authApi',
        build: AUTH_API_BUILD,
        project,
        firestoreDatabase: FIRESTORE_DATABASE_ID,
        firestoreUsersReadable: true,
        usersCollectionHasData: !probe.empty
      });
    } catch (error) {
      console.error('authApi health error', {
        stage: authStage,
        name: error?.name,
        code: error?.code,
        message: error?.message,
        stack: error?.stack
      });
      return json(res, 500, {
        success: false,
        code: 'AUTH_HEALTH_FIRESTORE_ERROR',
        stage: authStage,
        build: AUTH_API_BUILD,
        message: 'Firebase Auth API aktif tetapi gagal membaca Firestore.'
      });
    }
  }

  if (req.method !== 'POST') return json(res, 405, { message: 'Method tidak diizinkan.', code: 'AUTH_METHOD_NOT_ALLOWED', build: AUTH_API_BUILD });


  try {
    let body = req.body;
    if (typeof body === 'string' && body.trim()) {
      try { body = JSON.parse(body); } catch {}
    } else if (Buffer.isBuffer(body)) {
      try { body = JSON.parse(body.toString('utf8')); } catch {}
    }
    const bodyAction = body?.action ? String(body.action).trim() : '';
    const rawSegments = String(req.path || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const lastSegment = rawSegments.length > 0 ? rawSegments[rawSegments.length - 1] : '';
    const pathAction = (lastSegment && lastSegment !== 'auth' && lastSegment !== 'authApi' && lastSegment !== 'api') ? lastSegment : '';
    const action = bodyAction || pathAction;

    if (action === 'health') {
      authStage = 'health-firestore';
      const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'sidokter-soegiri';
      const dbInstance = getFirestoreInstance();
      const probe = await dbInstance.collection(USERS).limit(1).get();
      return json(res, 200, {
        status: 'ok',
        service: 'authApi',
        build: AUTH_API_BUILD,
        project,
        firestoreDatabase: FIRESTORE_DATABASE_ID,
        firestoreUsersReadable: true,
        usersCollectionHasData: !probe.empty
      });
    }

    if (action === 'bootstrap-admin') {
      return await bootstrapInitialAdmin(req, res);
    }

    if (action === 'login') {
      const username = normalizeUsername(body?.username);
      const password = String(body?.password || '');
      if (!username || !password) return json(res, 400, { message: 'Nama pengguna dan kata sandi wajib diisi.' });

      const rate = checkLoginRate(req, username);
      if (!rate.allowed) return json(res, 429, { message: `Terlalu banyak percobaan login. Coba lagi dalam sekitar ${rate.retryAfter} menit.`, lockedOut: true, remainingMinutes: rate.retryAfter });

      authStage = 'find-user';
      const found = await findUser(username);
      if (!found) {
        await audit({ username, event: 'LOGIN_FAILED', details: 'Akun tidak terdaftar.' });
        return json(res, 401, { message: 'Nama pengguna atau kata sandi tidak valid.' });
      }

      const { id, data: user } = found;
      const now = Date.now();
      if (user.lockoutUntil && user.lockoutUntil > now) {
        const remainingMinutes = Math.ceil((user.lockoutUntil - now) / 60000);
        return json(res, 429, { message: `Akun terkunci sementara. Silakan coba lagi dalam ${remainingMinutes} menit.`, lockedOut: true, remainingMinutes });
      }

      authStage = 'credential';
      const credential = await getCredential(id, user);
      const credentialData = credential.data;
      if (!credentialData?.passwordHash || !credentialData?.passwordSalt) {
        await audit({ username, name: user.name, role: user.role, event: 'LOGIN_FAILED', details: 'Akun belum memiliki credential aktif. Password harus ditetapkan oleh Administrator.' });
        return json(res, 403, { message: 'Akun belum diaktifkan. Hubungi Administrator untuk menetapkan kata sandi.' });
      }
      let valid = false;
      if (credentialData?.passwordHash && credentialData?.passwordSalt) {
        valid = verifyPassword(password, credentialData.passwordHash, credentialData.passwordSalt);
      }
      if (!valid) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const locked = attempts >= MAX_FAILED_ATTEMPTS;
        const update = {
          failedLoginAttempts: locked ? 0 : attempts,
          lockoutUntil: locked ? now + LOCKOUT_MS : 0
        };
        await db.collection(USERS).doc(id).update(update);
        await audit({ username, name: user.name, role: user.role, event: locked ? 'LOCKED_OUT' : 'LOGIN_FAILED', details: locked ? 'Akun terkunci 15 menit setelah percobaan gagal berulang.' : `Percobaan gagal ke-${attempts}/${MAX_FAILED_ATTEMPTS}.` });
        if (locked) return json(res, 429, { message: 'Akun Anda dikunci sementara selama 15 menit karena terlalu banyak percobaan login gagal.', lockedOut: true, remainingMinutes: 15 });
        return json(res, 401, { message: `Kata sandi salah. Sisa kesempatan: ${MAX_FAILED_ATTEMPTS - attempts} kali.` });
      }

      authStage = 'session-id';
      const sessionId = crypto.randomUUID();
      const sessionCreatedAt = now;
      authStage = 'user-login-update';
      await db.collection(USERS).doc(id).update({
        lastLoginAt: new Date().toISOString(),
        failedLoginAttempts: 0,
        lockoutUntil: 0
      });

      // SIDOKTER multi-device policy: each successful login gets its own
      // independent server-side session. Existing sessions remain active.
      authStage = 'create-session';
      await createSession(id, sessionId, sessionCreatedAt, {
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        ip: requestIp(req)
      });

      authStage = 'audit-success';
      await audit({ username, name: user.name, role: user.role, sessionId, event: 'LOGIN_SUCCESS', details: 'Login berhasil melalui trusted authentication service.' });
      const hierarchyClaims = getUserHierarchyClaims(user);
      // Keep the complete SOP authorization scope server-authoritative in the
      // user's Firestore profile. Custom Auth claims are intentionally kept
      // small because Firebase custom claims have a strict payload limit.
      // Firestore Rules read sopAccessKeys from this protected profile, while
      // the client may still batch array-contains-any queries at <=30 keys.
      authStage = 'save-sop-scope';
      await db.collection(USERS).doc(id).set({
        sopAccessKeys: hierarchyClaims.hierarchyKeys,
        sopGlobalAccess: hierarchyClaims.globalHierarchyAccess,
        sopAccessVersion: 3
      }, { merge: true });
      try {
        await reconcileSopReadIndexForUser(id, { ...user, sopAccessKeys: hierarchyClaims.hierarchyKeys, sopGlobalAccess: hierarchyClaims.globalHierarchyAccess }, false);
      } catch (recErr) {
        console.warn('Non-fatal reconcileSopReadIndexForUser notice on login:', recErr?.message || recErr);
      }
      authStage = 'custom-token';
      let customToken;
      try {
        customToken = await getAuthSafe().createCustomToken(id, {
          role: user.role,
          username: user.username,
          sessionId,
          globalHierarchyAccess: hierarchyClaims.globalHierarchyAccess
        });
      } catch (tokenErr) {
        console.error('Custom token generation failed on login:', tokenErr);
        return json(res, 500, {
          success: false,
          code: 'AUTH_CUSTOM_TOKEN_ERROR',
          stage: authStage,
          message: 'Layanan autentikasi gagal membuat token sesi Firebase.',
          build: AUTH_API_BUILD
        });
      }

      return json(res, 200, { success: true, customToken, session: publicSession(found, sessionId, sessionCreatedAt), message: 'Login berhasil.' });
    }

    if (!action) {
      return json(res, 400, {
        success: false,
        code: 'AUTH_ACTION_REQUIRED',
        message: 'Parameter action autentikasi wajib diisi.',
        build: AUTH_API_BUILD
      });
    }

    authStage = 'require-auth';
    const context = await requireAuth(req);

    if (action === 'session') {
      // Refresh the server-authoritative SOP scope on every validated session
      // request. This repairs older user profiles that predate sopAccessKeys
      // and also makes assignment changes effective without relying on stale
      // Firebase custom claims or a browser cache.
      const sessionHierarchyClaims = getUserHierarchyClaims(context.user);
      try {
        await context.ref.set({
          sopAccessKeys: sessionHierarchyClaims.hierarchyKeys,
          sopGlobalAccess: sessionHierarchyClaims.globalHierarchyAccess,
          sopAccessVersion: 3
        }, { merge: true });
      } catch (profErr) {
        console.warn('Non-fatal profile claims update notice:', profErr?.message || profErr);
      }
      try {
        await reconcileSopReadIndexForUser(context.decoded.uid, { ...context.user, sopAccessKeys: sessionHierarchyClaims.hierarchyKeys, sopGlobalAccess: sessionHierarchyClaims.globalHierarchyAccess }, false);
      } catch (recErr) {
        console.warn('Non-fatal reconcileSopReadIndexForUser notice on session refresh:', recErr?.message || recErr);
      }
      const effectiveSessionId = context.session?.sessionId || context.decoded?.sessionId || 'sess_active';
      const session = publicSession(
        { id: context.decoded.uid, data: { ...context.user, sopAccessKeys: sessionHierarchyClaims.hierarchyKeys, sopGlobalAccess: sessionHierarchyClaims.globalHierarchyAccess } },
        effectiveSessionId,
        Number(context.user.sessionCreatedAt || Date.now())
      );
      let customToken = effectiveSessionId;
      try {
        customToken = await getAuthSafe().createCustomToken(context.decoded.uid, {
          role: context.user.role,
          username: context.user.username,
          sessionId: effectiveSessionId,
          globalHierarchyAccess: sessionHierarchyClaims.globalHierarchyAccess
        });
      } catch (e) {
        console.warn('Could not generate customToken during session refresh:', e?.message || e);
      }
      return json(res, 200, { success: true, session, customToken });
    }

    if (action === 'sop-list') {
      // Trusted server-side SOP read. This is the compatibility path for
      // browsers/devices whose direct Firestore client authorization cannot
      // evaluate the application session reliably. It uses the same hierarchy
      // scope as the rest of SIDOKTER and never returns documents outside it.
      const claims = getUserHierarchyClaims(context.user);
      const global = context.user.role === 'admin' || claims.globalHierarchyAccess === true;
      const userKeys = new Set(claims.hierarchyKeys || []);
      const snap = await db.collection('sops').get();
      const sops = [];
      for (const d of snap.docs) {
        const data = d.data() || {};
        if (data.isNumberReservation) continue;
        const accessKeys = new Set(Array.isArray(data.accessKeys)
          ? data.accessKeys.map(v => String(v).trim().toUpperCase()).filter(Boolean)
          : getSopAccessKeysServer(data));
        if (global || Array.from(accessKeys).some(k => userKeys.has(k))) {
          sops.push({ ...data, id: data.id || d.id });
        }
      }
      return json(res, 200, { success: true, sops, source: 'trusted-server' });
    }

    if (action === 'migrate-sop-access') {
      return await migrateSopAccessBoundary(req, res, context);
    }

    if (action === 'logout') {
      const sessionId = String(req.body?.sessionId || '');
      if (sessionId) await revokeSession(context.decoded.uid, sessionId);
      await audit({ username: context.user.username, name: context.user.name, role: context.user.role, sessionId, event: 'LOGOUT', details: 'Logout manual.' });
      return json(res, 200, { success: true, message: 'Logout berhasil.' });
    }

    if (action === 'revoke-all') {
      await revokeAllSessions(context.decoded.uid);
      await context.ref.update({ updatedAt: new Date().toISOString() });
      await audit({ username: context.user.username, name: context.user.name, role: context.user.role, event: 'SESSION_REVOKED', details: 'Seluruh sesi aktif dicabut.' });
      return json(res, 200, { success: true, message: 'Seluruh sesi aktif akun telah dicabut.' });
    }

    if (action === 'user-list') {
      if (context.user.role !== 'admin') return json(res, 403, { message: 'Hanya Administrator yang dapat melihat daftar akun.' });
      const snap = await db.collection(USERS).get();
      const users = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (!data?.username || String(data.username).toLowerCase() === 'guest') continue;
        // Migrate any legacy credential material out of users/ before returning data.
        await getCredential(d.id, data);
        const fresh = (await d.ref.get()).data() || {};
        users.push({
          id: d.id, username: fresh.username, name: fresh.name || fresh.username,
          role: normalizeRole(fresh.role), unitName: fresh.unitName,
          divisionCode: fresh.divisionCode, divisionCodes: fresh.divisionCodes,
          assignments: fresh.assignments, badges: fresh.badges,
          subCode: fresh.subCode, instCode: fresh.instCode, poliCode: fresh.poliCode, subUnitCode: fresh.subUnitCode,
          createdAt: fresh.createdAt || '', updatedAt: fresh.updatedAt, credentialStatus: fresh.credentialStatus || ((await db.collection(USER_CREDENTIALS).doc(d.id).get()).exists ? 'ACTIVE' : 'PASSWORD_REQUIRED')
        });
      }
      return json(res, 200, { success: true, users });
    }

    if (action === 'user-save') {
      if (context.user.role !== 'admin') return json(res, 403, { message: 'Hanya Administrator yang dapat mengelola akun.' });

      const incoming = req.body?.user || {};
      const userId = String(incoming.id || '').trim();
      const username = normalizeUsername(incoming.username);
      const name = String(incoming.name || '').trim();
      const role = incoming.role === 'admin' ? 'admin' : 'user';
      const password = String(req.body?.password || '');

      if (!userId || !username || !name) return json(res, 400, { message: 'Data akun belum lengkap.' });
      if (password && (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))) {
        return json(res, 400, { message: 'Kata sandi minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, serta angka.' });
      }

      const usernameSnap = await db.collection(USERS).where('username', '==', username).limit(2).get();
      const duplicate = usernameSnap.docs.find(d => d.id !== userId);
      if (duplicate) return json(res, 409, { message: 'Username tersebut sudah digunakan.' });

      const ref = db.collection(USERS).doc(userId);
      const existingSnap = await ref.get();
      const existing = existingSnap.exists ? existingSnap.data() : null;
      const existingCredential = existing ? await getCredential(userId, existing) : { data: null };
      if (!existing && !password) return json(res, 400, { message: 'Kata sandi wajib diisi untuk akun baru.' });
      if (userId === context.decoded.uid && role !== 'admin') return json(res, 400, { message: 'Akun Administrator aktif tidak boleh diturunkan menjadi User.' });

      const allowedProfile = {
        id: userId,
        username,
        name,
        role,
        divisionCode: role === 'admin' ? 'ALL' : incoming.divisionCode,
        divisionCodes: role === 'admin' ? ['ALL'] : (Array.isArray(incoming.divisionCodes) ? incoming.divisionCodes : undefined),
        assignments: role === 'admin' ? [] : (Array.isArray(incoming.assignments) ? incoming.assignments : []),
        badges: role === 'admin' ? [] : (Array.isArray(incoming.badges) ? incoming.badges : []),
        subCode: role === 'admin' ? FieldValue.delete() : (incoming.subCode || null),
        instCode: role === 'admin' ? FieldValue.delete() : (incoming.instCode || null),
        poliCode: role === 'admin' ? FieldValue.delete() : (incoming.poliCode || null),
        subUnitCode: role === 'admin' ? FieldValue.delete() : (incoming.subUnitCode || null),
        unitName: String(incoming.unitName || 'Unit Kerja RSUD Dr. Soegiri'),
        createdAt: existing?.createdAt || incoming.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const profileHierarchyClaims = getUserHierarchyClaims(allowedProfile);
      const update = {
        ...allowedProfile,
        sopAccessKeys: profileHierarchyClaims.hierarchyKeys,
        sopGlobalAccess: profileHierarchyClaims.globalHierarchyAccess,
        sopAccessVersion: 4
      };
      if (password) {
        // Credentials are stored in a backend-only collection, never in users/.
        const salt = crypto.randomBytes(16);
        const passwordHash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
        await db.collection(USER_CREDENTIALS).doc(userId).set({
          passwordHash,
          passwordSalt: salt.toString('hex'),
          updatedAt: new Date().toISOString()
        }, { merge: true });
        update.credentialStatus = 'ACTIVE';
      }

      // Strip any legacy credential fields if they exist on the profile.
      update.passwordHash = FieldValue.delete();
      update.passwordSalt = FieldValue.delete();
      update.password = FieldValue.delete();
      if (!password && existing?.credentialStatus === undefined) {
        update.credentialStatus = existingCredential.data ? 'ACTIVE' : 'PASSWORD_REQUIRED';
      }
      await ref.set(update, { merge: true });
      try {
        await reconcileSopReadIndexForUser(userId, { ...allowedProfile, ...update }, true);
      } catch (recErr) {
        console.warn('Non-fatal reconcileSopReadIndexForUser notice on user-save:', recErr?.message || recErr);
      }
      if (password) await revokeAllSessions(userId);
      await audit({
        username,
        name,
        role,
        actorUid: context.decoded.uid,
        event: existing ? 'USER_UPDATED' : 'USER_CREATED',
        details: password ? 'Profil akun diperbarui dan kredensial diperbarui.' : 'Profil akun diperbarui.'
      });
      return json(res, 200, { success: true, message: existing ? 'Akun berhasil diperbarui.' : 'Akun berhasil dibuat.' });
    }

    if (action === 'user-restore-profile') {
      if (context.user.role !== 'admin') return json(res, 403, { message: 'Hanya Administrator yang dapat memulihkan profil akun.' });
      const incoming = req.body?.user || {};
      const userId = String(incoming.id || '').trim();
      const username = normalizeUsername(incoming.username);
      const name = String(incoming.name || '').trim();
      const role = incoming.role === 'admin' ? 'admin' : 'user';
      if (!userId || !username || !name) return json(res, 400, { message: 'Data profil akun belum lengkap.' });
      const dup = await db.collection(USERS).where('username', '==', username).limit(2).get();
      if (dup.docs.some(d => d.id !== userId)) return json(res, 409, { message: 'Username tersebut sudah digunakan.' });
      const ref = db.collection(USERS).doc(userId);
      const existingSnap = await ref.get();
      const existing = existingSnap.exists ? existingSnap.data() : null;
      const profile = {
        id: userId, username, name, role,
        divisionCode: role === 'admin' ? 'ALL' : incoming.divisionCode,
        divisionCodes: role === 'admin' ? ['ALL'] : (Array.isArray(incoming.divisionCodes) ? incoming.divisionCodes : undefined),
        assignments: role === 'admin' ? undefined : (Array.isArray(incoming.assignments) ? incoming.assignments : undefined),
        badges: role === 'admin' ? [] : (Array.isArray(incoming.badges) ? incoming.badges : []),
        unitName: String(incoming.unitName || 'Unit Kerja RSUD Dr. Soegiri'),
        subCode: role === 'admin' ? null : (incoming.subCode || null),
        instCode: role === 'admin' ? null : (incoming.instCode || null),
        poliCode: role === 'admin' ? null : (incoming.poliCode || null),
        subUnitCode: role === 'admin' ? null : (incoming.subUnitCode || null),
        createdAt: existing?.createdAt || incoming.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        credentialStatus: 'PASSWORD_REQUIRED'
      };
      await ref.set(profile, { merge: true });
      await db.collection(USER_CREDENTIALS).doc(userId).delete();
      await revokeAllSessions(userId);
      await audit({ username, name, role, actorUid: context.decoded.uid, event: 'USER_RESTORED_PROFILE', details: 'Profil akun dipulihkan tanpa memulihkan credential. Password harus ditetapkan ulang oleh Administrator.' });
      return json(res, 200, { success: true, message: 'Profil akun dipulihkan. Password harus ditetapkan ulang sebelum akun dapat digunakan.' });
    }

    if (action === 'user-delete') {
      if (context.user.role !== 'admin') return json(res, 403, { message: 'Hanya Administrator yang dapat mengelola akun.' });
      const userId = String(req.body?.userId || '').trim();
      if (!userId) return json(res, 400, { message: 'ID akun wajib diisi.' });
      if (userId === context.decoded.uid) return json(res, 400, { message: 'Akun Administrator yang sedang digunakan tidak dapat dihapus.' });

      const ref = db.collection(USERS).doc(userId);
      const snap = await ref.get();
      if (!snap.exists) return json(res, 404, { message: 'Akun tidak ditemukan.' });
      const target = snap.data();
      await ref.delete();
      await db.collection(USER_CREDENTIALS).doc(userId).delete();
      await revokeAllSessions(userId);
      await audit({
        username: target.username,
        name: target.name,
        role: target.role,
        actorUid: context.decoded.uid,
        event: 'USER_DELETED',
        details: 'Akun dihapus oleh Administrator.'
      });
      return json(res, 200, { success: true, message: 'Akun berhasil dihapus.' });
    }

    if (action === 'change-password') {
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');
      if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return json(res, 400, { message: 'Kata sandi baru minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, serta angka.' });
      }
      const credential = await getCredential(context.decoded.uid, context.user);
      if (!credential.data?.passwordHash || !credential.data?.passwordSalt || !verifyPassword(currentPassword, credential.data.passwordHash, credential.data.passwordSalt)) {
        return json(res, 401, { message: 'Kata sandi lama yang Anda masukkan salah.' });
      }
      const salt = crypto.randomBytes(16);
      const hash = crypto.pbkdf2Sync(newPassword, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
      await credential.ref.set({ passwordHash: hash, passwordSalt: salt.toString('hex'), updatedAt: new Date().toISOString() }, { merge: true });
      await context.ref.update({ updatedAt: new Date().toISOString(), passwordHash: FieldValue.delete(), passwordSalt: FieldValue.delete(), password: FieldValue.delete() });
      await audit({ username: context.user.username, name: context.user.name, role: context.user.role, event: 'PASSWORD_CHANGED', details: 'Kata sandi berhasil diganti.' });
      return json(res, 200, { success: true, message: 'Kata sandi Anda berhasil diperbarui.' });
    }

    return json(res, 404, { message: 'Endpoint autentikasi tidak ditemukan.' });
  } catch (error) {
    // Keep the browser response safe but diagnostic enough to identify the exact
    // login stage after a Firebase project migration. Never expose passwords,
    // hashes, salts, tokens, or full Firestore error payloads to the client.
    console.error('authApi error', {
      stage: authStage,
      name: error?.name,
      code: error?.code,
      message: error?.message,
      stack: error?.stack
    });
    const rawCode = String(error?.code || error?.message || 'AUTH_INTERNAL_ERROR');
    const authErrors = new Set([
      'UNAUTHENTICATED', 'SESSION_REQUIRED', 'USER_NOT_FOUND', 'SESSION_REVOKED', 'SESSION_EXPIRED',
      'auth/id-token-expired', 'auth/argument-error', 'auth/invalid-id-token',
      'auth/user-not-found', 'auth/id-token-revoked'
    ]);
    const isAuth = authErrors.has(rawCode) || rawCode.startsWith('auth/') || rawCode.includes('id-token') || rawCode.includes('argument-error');
    const status = isAuth ? 401 : 500;
    const safeStageCode = {
      'request': 'AUTH_REQUEST_ERROR',
      'require-auth': 'AUTH_UNAUTHORIZED',
      'find-user': 'AUTH_FIRESTORE_USER_READ_ERROR',
      'credential': 'AUTH_CREDENTIAL_ERROR',
      'session-id': 'AUTH_SESSION_ID_ERROR',
      'user-login-update': 'AUTH_USER_UPDATE_ERROR',
      'create-session': 'AUTH_SESSION_WRITE_ERROR',
      'audit-success': 'AUTH_AUDIT_ERROR',
      'save-sop-scope': 'AUTH_SOP_SCOPE_ERROR',
      'custom-token': 'AUTH_CUSTOM_TOKEN_ERROR'
    }[authStage] || 'AUTH_INTERNAL_ERROR';
    const message = rawCode === 'SESSION_REVOKED'
      ? 'Sesi Anda sudah dicabut. Silakan login kembali.'
      : rawCode === 'USER_NOT_FOUND'
        ? 'Pengguna tidak ditemukan di direktori akun.'
        : rawCode === 'UNAUTHENTICATED' || rawCode === 'SESSION_REQUIRED'
          ? 'Autentikasi diperlukan. Silakan login terlebih dahulu.'
          : isAuth
            ? 'Sesi login tidak valid atau sudah berakhir. Silakan login kembali.'
            : 'Layanan autentikasi gagal memproses permintaan.';
    return json(res, status, {
      success: false,
      message,
      code: isAuth ? rawCode : safeStageCode,
      stage: authStage,
      build: AUTH_API_BUILD
    });
  }
});


function safePdfFilename(value) {
  const base = String(value || 'SPO_RSUD_Dr_Soegiri').trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return `${base || 'SPO_RSUD_Dr_Soegiri'}.pdf`;
}

async function resolvePuppeteerExecutable() {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  if (configured && fs.existsSync(configured)) return configured;

  // Production path: use the exact Chromium supplied by @sparticuz/chromium.
  // Do this before system-browser discovery so a random runtime Chrome cannot
  // silently introduce a Puppeteer/Chromium version mismatch.
  try {
    const chromium = await getServerlessChromium();
    const executablePath = await chromium.executablePath();
    if (executablePath && fs.existsSync(executablePath)) {
      try { fs.chmodSync(executablePath, 0o755); } catch {}
      return executablePath;
    }
  } catch (error) {
    console.error('[PDF] Serverless Chromium resolution failed:', error?.message || error);
  }

  // Local/self-hosted fallback only. Production should use the pinned
  // @sparticuz/chromium binary above unless an explicit executable is set.
  const systemCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    '/usr/lib/chromium/chrome'
  ];
  const systemPath = systemCandidates.find((candidate) => fs.existsSync(candidate));
  if (systemPath) return systemPath;

  return '';
}

function pdfCors(req, res) {
  const origin = String(req.headers.origin || '');
  const configured = String(process.env.AUTH_ALLOWED_ORIGINS || process.env.AUTH_ALLOWED_ORIGIN || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'sidokter-soegiri';
  const builtIn = new RegExp(`^https://(?:sidokter-soegiri|${projectId})\\.(?:web\\.app|firebaseapp\\.com)$`);
  const vercel = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
  const local = /^http:\/\/localhost:\d+$/;
  if (origin && (configured.includes(origin) || builtIn.test(origin) || local.test(origin) || vercel.test(origin) || origin.endsWith('.run.app') || origin.includes('sidokter-soegiri'))) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Soegiri-Auth-Uid, X-Soegiri-Session-Id, X-Session-Id, X-User-Username');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function requirePdfSession(req) {
  const header = String(req.headers.authorization || '');
  const xSessionId = String(req.headers['x-session-id'] || req.headers['x-soegiri-session-id'] || '');
  const xAuthUid = String(req.headers['x-soegiri-auth-uid'] || req.headers['x-user-id'] || '');

  let uid = '';
  let sessionId = xSessionId;

  if (header.startsWith('Bearer ')) {
    const rawToken = header.slice(7).trim();
    try {
      const decoded = await getAuthSafe().verifyIdToken(rawToken, true);
      uid = decoded.uid;
      if (decoded.sessionId) sessionId = decoded.sessionId;
    } catch (tokenErr) {
      console.warn('[PDF] verifyIdToken failed, falling back to session headers:', tokenErr?.message);
    }
  }

  if (!uid && xAuthUid) {
    uid = xAuthUid;
  }

  if (!uid && !sessionId) throw new Error('UNAUTHENTICATED');

  let userRef = null;
  let user = null;

  if (uid) {
    userRef = db.collection(USERS).doc(uid);
    const snap = await userRef.get();
    if (snap.exists) {
      user = snap.data();
    }
  }

  if (!user && sessionId) {
    // Try to find session across session_states to resolve user
    try {
      const snap = await db.collectionGroup('sessions').where('sessionId', '==', sessionId).limit(1).get();
      if (!snap.empty) {
        const sessDoc = snap.docs[0];
        const sessData = sessDoc.data();
        if (!sessData?.revoked) {
          const parentUid = sessDoc.ref.parent.parent?.id || sessData?.authUid;
          if (parentUid) {
            uid = parentUid;
            userRef = db.collection(USERS).doc(uid);
            const uSnap = await userRef.get();
            if (uSnap.exists) user = uSnap.data();
          }
        }
      }
    } catch (grpErr) {
      console.warn('[PDF] SessionGroup lookup warning:', grpErr?.message);
    }
  }

  if (!user && !uid) throw new Error('USER_NOT_FOUND');
  if (!user) {
    // Fallback minimal user object so download is not broken
    user = { username: uid || 'user', role: 'user', name: 'User' };
  }

  if (sessionId && uid) {
    const active = await getActiveSession(uid, sessionId);
    if (!active) {
      // Check if session doc exists but might not be marked revoked
      const sSnap = await db.collection('session_states').doc(uid).collection('sessions').doc(sessionId).get();
      if (sSnap.exists && sSnap.data()?.revoked) {
        throw new Error('SESSION_REVOKED');
      }
    }
  }

  const username = normalizeUsername(user.username);
  return { authUid: uid || 'user', sessionId: sessionId || '', username, ref: userRef, user };
}

/**
 * Direct PDF renderer for the official SPO document.
 *
 * The browser sends the already-paginated A4 document DOM and the compiled
 * CSS used by the application. Chromium is used only as the PDF renderer;
 * it does not perform application pagination. This keeps the React document
 * pagination authoritative while producing a real, searchable PDF (not an
 * image/canvas PDF).
 */

const STORAGE_COLLECTION = 'storage_files';
const { resolveStorageObjectPath } = require('./storageMetadata');
const { classifyStorageRequest } = require('./storageRouting');
const STORAGE_MAX_BYTES = 15 * 1024 * 1024;
const STORAGE_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);
let cachedStorageBucket = null;
function getStorageBucket() {
  if (!cachedStorageBucket) {
    const app = ensureInitialized();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.STORAGE_BUCKET || 'sidokter-soegiri.firebasestorage.app';
    cachedStorageBucket = getStorage(app).bucket(bucketName);
  }
  return cachedStorageBucket;
}

function storageCors(req, res) {
  const origin = String(req.headers.origin || '');
  const configured = String(process.env.AUTH_ALLOWED_ORIGINS || process.env.AUTH_ALLOWED_ORIGIN || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'sidokter-soegiri';
  const builtIn = new RegExp(`^https://(?:sidokter-soegiri|${projectId})\\.(?:web\\.app|firebaseapp\\.com)$`);
  const vercel = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
  const local = /^http:\/\/localhost:\d+$/;
  const aiStudio = /^https:\/\/[^/]+\.run\.app$/;

  const allowed = !origin || configured.includes(origin) || builtIn.test(origin) ||
    local.test(origin) || vercel.test(origin) || aiStudio.test(origin) ||
    origin.includes('sidokter-soegiri');

  if (origin && allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id, X-Soegiri-Session-Id, X-Soegiri-Auth-Uid, X-User-Username, Accept, Origin');
  res.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, DELETE, OPTIONS');
  res.set('Access-Control-Max-Age', '3600');
}

function storageAccessKeys(session) {
  const out = new Set();
  const normalize = v => String(v || '').trim().replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
  const assignments = Array.isArray(session.assignments) && session.assignments.length
    ? session.assignments
    : (Array.isArray(session.divisionCodes) && session.divisionCodes.length
      ? session.divisionCodes.map(divisionCode => ({ divisionCode }))
      : [{ divisionCode: session.divisionCode, subCode: session.subCode, instCode: session.instCode, poliCode: session.poliCode, subUnitCode: session.subUnitCode }]);
  for (const a of assignments) {
    const division = normalize(a?.divisionCode).toUpperCase();
    if (!division) continue;
    out.add(division);
    const hierarchy = normalize(a?.hierarchyCode || a?.hierarchyPath?.filter(Boolean).join('.') || [a?.subCode, a?.instCode, a?.poliCode, a?.subUnitCode].filter(Boolean).join('.'));
    if (hierarchy) {
      const parts = hierarchy.split('.').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) out.add(`${division}|${parts.slice(0, i).join('.')}`);
    }
  }
  return out;
}

async function requireStorageAuth(req) {
  return requireAuth(req);
}

async function storageUpload(req, res) {
  const context = await requireStorageAuth(req);
  const { fileData, fileName, fileType, id: requestedId, resourceType } = req.body || {};
  if (!fileData || typeof fileData !== 'string') return json(res, 400, { success:false, message:'fileData wajib disertakan.' });
  const safeName = String(fileName || 'dokumen.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = String(requestedId || `file_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const mime = String(fileType || 'application/pdf');
  if (!STORAGE_MIME.has(mime)) return json(res, 415, { success:false, message:'Jenis file tidak didukung.' });
  const comma = fileData.indexOf(',');
  const raw = comma >= 0 ? fileData.slice(comma + 1) : fileData;
  let buffer;
  try { buffer = Buffer.from(raw, 'base64'); } catch { return json(res, 400, { success:false, message:'Data file tidak valid.' }); }
  if (!buffer.length || buffer.length > STORAGE_MAX_BYTES) return json(res, 413, { success:false, message:'Ukuran file tidak valid atau melebihi 15 MB.' });

  const isAdmin = normalizeRole(context.user.role) === 'admin';
  const isStructural = Array.isArray(context.user.badges) && context.user.badges.some(b => String(b).trim().toUpperCase() === 'STRUKTURAL');
  // The caller supplies the document domain, but IDs are also interpreted
  // server-side so a stale client cannot place SK/MOU files under OTHER.
  const inferredType = id.startsWith('library-sk-') ? 'SK'
    : id.startsWith('library-mou-') ? 'MOU'
    : (id.includes('_signedScan') || id.includes('_oldFile') || id.includes('_file') || id.startsWith('sop-') ? 'SPO' : 'OTHER');
  const requestedType = String(resourceType || inferredType).toUpperCase();
  const type = inferredType !== 'OTHER'
    ? inferredType
    : (['SPO', 'SK', 'MOU', 'OTHER'].includes(requestedType) ? requestedType : 'OTHER');
  if ((type === 'SK' || type === 'MOU') && !(isAdmin || isStructural)) return json(res, 403, { success:false, message:'Akses upload SK/MOU ditolak.' });

  const ext = path.extname(safeName) || (mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg');
  const objectPath = `sidokter/${type.toLowerCase()}/${id}${ext}`;
  const file = getStorageBucket().file(objectPath);
  await file.save(buffer, { resumable:false, metadata:{ contentType:mime, metadata:{ originalName:safeName, ownerUid:context.user.id, resourceType:type } } });
  const meta = {
    id, objectPath, originalName:safeName, mimeType:mime, size:buffer.length,
    uploadedAt:new Date().toISOString(), resourceType:type, ownerUid:context.user.id,
    sopId: extractSopIdFromStorageRef(id) || extractSopIdFromStorageRef(objectPath),
    accessKeys:Array.from(storageAccessKeys(context.user))
  };
  await db.collection(STORAGE_COLLECTION).doc(id).set(meta, { merge:true });
  return json(res, 200, { success:true, fileId:id, url:`/api/storage/files/${id}`, storagePath:objectPath, fileName:safeName, fileSize:buffer.length, mimeType:mime });
}

async function streamStorageObject(req, res, file, fallbackMeta = {}) {
  const [exists] = await file.exists();
  if (!exists) return false;

  const [fm] = await file.getMetadata();
  res.set('Content-Type', fm.contentType || fallbackMeta.mimeType || 'application/pdf');
  res.set('Content-Length', String(fm.size || fallbackMeta.size || 0));
  res.set('Content-Disposition', `inline; filename="${encodeURIComponent(fallbackMeta.originalName || path.basename(file.name || 'dokumen.pdf'))}"`);
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') {
    res.status(200).end();
    return true;
  }
  file.createReadStream().on('error', err => {
    console.error('[storage] stream error', err);
    if (!res.headersSent) res.status(500);
  }).pipe(res);
  return true;
}

function isPrivilegedStorageViewer(context) {
  const isAdmin = normalizeRole(context.user.role) === 'admin';
  const isStructural = Array.isArray(context.user.badges) &&
    context.user.badges.some(b => String(b).trim().toUpperCase() === 'STRUKTURAL');
  return isAdmin || isStructural;
}

async function canReadSopBinaryForUser(context, sopId) {
  try {
    const id = String(sopId || '').trim();
    if (!id) return false;
    const isAdmin = normalizeRole(context.user.role) === 'admin';
    const isStructural = Array.isArray(context.user.badges) &&
      context.user.badges.some(b => String(b).trim().toUpperCase() === 'STRUKTURAL');
    const hasGlobalAccess = Boolean(
      context.user.sopGlobalAccess ||
      String(context.user.divisionCode || '').trim().toUpperCase() === 'ALL' ||
      (Array.isArray(context.user.divisionCodes) && context.user.divisionCodes.some(v => String(v).trim().toUpperCase() === 'ALL')) ||
      (Array.isArray(context.user.assignments) && context.user.assignments.some(a => String(a?.divisionCode || '').trim().toUpperCase() === 'ALL'))
    );
    if (isAdmin || isStructural || hasGlobalAccess) return true;

    const snap = await db.collection('sops').doc(id).get();
    if (!snap.exists) return false;
    const sop = snap.data() || {};
    if (Array.isArray(sop.authorizedUids) && sop.authorizedUids.map(String).includes(String(context.user.id))) return true;

    const sopKeys = new Set(
      (Array.isArray(sop.accessKeys) && sop.accessKeys.length ? sop.accessKeys : getSopAccessKeysServer(sop))
        .map(v => String(v).trim().toUpperCase()).filter(Boolean)
    );
    if (sopKeys.has('ALL')) return true;
    const userKeys = storageAccessKeys(context.user);
    return Array.from(sopKeys).some(k => userKeys.has(k));
  } catch (err) {
    console.warn('[storage] SOP access lookup failed:', err?.message || err);
    return false;
  }
}

function extractSopIdFromStorageRef(value) {
  const raw = path.basename(String(value || '').split('?')[0]);
  const exact = raw.match(/^(sop-\d+)(?:_(?:signedScan|oldFile|file))?(?:\.[^.]+)?$/i);
  if (exact) return exact[1];
  const embedded = raw.match(/(sop-\d+)/i);
  return embedded ? embedded[1] : null;
}

function canReadStoragePathWithoutMetadata(context, objectPath) {
  // Legacy SPO files may exist in Storage without a matching storage_files
  // document. They remain protected by application login, not made public.
  if (objectPath.startsWith('sidokter/spo/') || objectPath.startsWith('sop-')) return true;
  if (objectPath.startsWith('sidokter/sk/') || objectPath.startsWith('sidokter/mou/')) {
    return isPrivilegedStorageViewer(context);
  }
  return false;
}

async function storageDownload(req, res) {
  const context = await requireStorageAuth(req);
  const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const snap = await db.collection(STORAGE_COLLECTION).doc(id).get();

  if (snap.exists) {
    const meta = snap.data();
    const objectPath = resolveStorageObjectPath(meta);
    if (!objectPath) {
      return json(res, 409, { success:false, code:'BROKEN_STORAGE_METADATA', message:'Metadata file tidak memiliki path Firebase Storage yang valid.' });
    }
    const isAdmin = normalizeRole(context.user.role) === 'admin';
    const isStructural = Array.isArray(context.user.badges) && context.user.badges.some(b => String(b).trim().toUpperCase() === 'STRUKTURAL');
    const hasGlobalAccess = Boolean(context.user.sopGlobalAccess || context.user.divisionCode === 'ALL');
    const keys = storageAccessKeys(context.user);
    let allowed = isAdmin || isStructural || hasGlobalAccess || meta.ownerUid === context.user.id || (Array.isArray(meta.accessKeys) && meta.accessKeys.some(k => keys.has(k)));
    if (!allowed && String(meta.resourceType || '').toUpperCase() === 'SPO') {
      const sopId = meta.sopId || extractSopIdFromStorageRef(meta.id || id || objectPath);
      if (sopId) allowed = await canReadSopBinaryForUser(context, sopId);
    }
    if (!allowed) return json(res, 403, { success:false, message:'Akses dokumen ditolak.' });

    const served = await streamStorageObject(req, res, getStorageBucket().file(objectPath), meta);
    if (served) return;
    return json(res, 404, { success:false, message:'File tidak ditemukan di Firebase Storage.' });
  }

  // Legacy/external SPO: the object can predate the storage_files Firestore
  // index. Resolve the conventional object path directly from Storage.
  const legacyCandidates = [
    `sidokter/spo/${id}.pdf`,
    `sidokter/spo/${id}.png`,
    `sidokter/spo/${id}.jpg`
  ];
  for (const objectPath of legacyCandidates) {
    if (!canReadStoragePathWithoutMetadata(context, objectPath)) continue;
    const served = await streamStorageObject(
      req,
      res,
      getStorageBucket().file(objectPath),
      { originalName: path.basename(objectPath) }
    );
    if (served) return;
  }

  return json(res, 404, { success:false, message:'File tidak ditemukan di Firebase Storage.' });
}

async function storageDownloadByPath(req, res) {
  const context = await requireStorageAuth(req);
  const raw = String(req.params.storagePath || '');
  let objectPath = raw;
  try { objectPath = decodeURIComponent(raw); } catch {}
  objectPath = objectPath.replace(/^\/+/, '');
  if (!objectPath || objectPath.includes('..')) {
    return json(res, 400, { success:false, message:'Storage path tidak valid.' });
  }

  // First use the Firestore index when present, preserving its fine-grained ACL.
  const snap = await db.collection(STORAGE_COLLECTION).where('objectPath', '==', objectPath).limit(1).get();
  if (!snap.empty) {
    const metaDoc = snap.docs[0];
    const meta = metaDoc.data();
    const metadataObjectPath = resolveStorageObjectPath(meta);
    if (!metadataObjectPath) {
      return json(res, 409, { success:false, code:'BROKEN_STORAGE_METADATA', message:'Metadata file tidak memiliki path Firebase Storage yang valid.' });
    }
    const isAdmin = normalizeRole(context.user.role) === 'admin';
    const isStructural = Array.isArray(context.user.badges) && context.user.badges.some(b => String(b).trim().toUpperCase() === 'STRUKTURAL');
    const hasGlobalAccess = Boolean(context.user.sopGlobalAccess || context.user.divisionCode === 'ALL');
    const keys = storageAccessKeys(context.user);
    let allowed = isAdmin || isStructural || hasGlobalAccess || meta.ownerUid === context.user.id || (Array.isArray(meta.accessKeys) && meta.accessKeys.some(k => keys.has(k)));
    if (!allowed && String(meta.resourceType || '').toUpperCase() === 'SPO') {
      const sopId = meta.sopId || extractSopIdFromStorageRef(meta.id || metadataObjectPath || objectPath);
      if (sopId) allowed = await canReadSopBinaryForUser(context, sopId);
    }
    if (!allowed) return json(res, 403, { success:false, message:'Akses dokumen ditolak.' });

    const served = await streamStorageObject(req, res, getStorageBucket().file(metadataObjectPath), meta);
    if (served) return;
    return json(res, 404, { success:false, message:'File tidak ditemukan di Firebase Storage.' });
  }

  // Critical legacy fallback: Storage is authoritative for old/external SPO
  // evidence, even when the storage_files index was never created/migrated.
  if (!canReadStoragePathWithoutMetadata(context, objectPath)) {
    return json(res, 403, { success:false, message:'Akses dokumen ditolak.' });
  }

  const file = getStorageBucket().file(objectPath);
  let served = await streamStorageObject(
    req,
    res,
    file,
    { originalName: path.basename(objectPath) }
  );
  if (served) return;

  if (!objectPath.startsWith('sidokter/')) {
    const prefixed = `sidokter/spo/${objectPath}`;
    const prefixedFile = getStorageBucket().file(prefixed);
    served = await streamStorageObject(
      req,
      res,
      prefixedFile,
      { originalName: path.basename(objectPath) }
    );
    if (served) return;
  }

  return json(res, 404, { success:false, message:'File tidak ditemukan di Firebase Storage.' });
}

async function storageDelete(req, res) {
  const context = await requireStorageAuth(req);
  if (normalizeRole(context.user.role) !== 'admin') return json(res, 403, { success:false, message:'Akses hapus file ditolak. Hanya Admin Root.' });
  const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const ref = db.collection(STORAGE_COLLECTION).doc(id);
  const snap = await ref.get();
  if (snap.exists) {
    const meta = snap.data();
    const objectPath = resolveStorageObjectPath(meta);
    if (!objectPath) return json(res, 409, { success:false, code:'BROKEN_STORAGE_METADATA', message:'Metadata file tidak memiliki path Firebase Storage yang valid.' });
    try { await getStorageBucket().file(objectPath).delete({ ignoreNotFound:true }); } catch (e) { console.warn('[storage] delete object warning', e?.message || e); }
    await ref.delete();
  }
  return json(res, 200, { success:true });
}

function getStorageRequestPath(req) {
  // Firebase Functions v2 can expose different values for req.path/req.url
  // depending on whether the function is called directly or through a
  // Hosting rewrite. Prefer the original URL and normalize all known forms.
  const candidates = [
    req.originalUrl,
    req.url,
    req.path,
    req.headers?.['x-forwarded-uri'],
    req.headers?.['x-original-url']
  ].filter(Boolean).map(v => String(v));

  for (const candidate of candidates) {
    const clean = candidate.split('?')[0];
    const match = clean.match(/(?:^|\/)storageApi(?:\/)?(\/.*)?$/i);
    if (match && match[1]) return match[1];
    const direct = clean.match(/(\/)(?:path|files|upload)(?:\/.*)?$/i);
    if (direct) return clean.slice(direct.index || 0);
  }

  return candidates[0] || '/';
}

function getStoragePathParam(pathName) {
  const marker = '/path/';
  const idx = pathName.toLowerCase().indexOf(marker);
  if (idx < 0) return '';
  return pathName.slice(idx + marker.length).replace(/\/?$/, '');
}

function getStorageFileId(pathName) {
  const marker = '/files/';
  const idx = pathName.toLowerCase().indexOf(marker);
  if (idx < 0) return '';
  return pathName.slice(idx + marker.length).replace(/\/?$/, '').split('/').filter(Boolean).pop() || '';
}

// Server-side hierarchy REST endpoint used as the Firebase Hosting fallback
// for multi-device master-data synchronization. The browser also syncs directly
// with Firestore, but /api/hierarchy must exist in Firebase Hosting because the
// previous Express server.ts is not deployed by Firebase Hosting.
exports.hierarchyApi = onRequest({
  region: 'asia-southeast2',
  invoker: 'public',
  cors: true,
  timeoutSeconds: 30,
  memory: '256MiB'
}, async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method === 'GET') {
      const snap = await db.collection('system_config').doc('hierarchy_master').get();
      if (!snap.exists) return json(res, 200, { success: true, source: 'empty', categories: [] });
      const value = snap.data()?.value;
      let categories = [];
      if (Array.isArray(value)) {
        categories = value;
      } else if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort((a, b) => {
          const na = Number(a), nb = Number(b);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return a.localeCompare(b);
        });
        categories = keys.map((k) => value[k]).filter(Boolean);
      }
      return json(res, 200, { success: true, source: 'firestore', categories });
    }

    if (req.method !== 'POST') {
      return json(res, 405, { success: false, message: 'Method tidak diizinkan.' });
    }

    const context = await requireAuth(req);
    const role = normalizeRole(context.user.role);
    const structural = Array.isArray(context.user.badges) && context.user.badges.some(
      (b) => String(b).trim().toUpperCase() === 'STRUKTURAL'
    );
    if (role !== 'admin' && !structural) {
      return json(res, 403, { success: false, message: 'Akses menyimpan master hierarki ditolak.' });
    }

    const body = req.body || {};
    let categories = body.categories;
    if (categories && !Array.isArray(categories) && typeof categories === 'object') {
      const keys = Object.keys(categories).sort((a, b) => {
        const na = Number(a), nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      });
      categories = keys.map((k) => categories[k]).filter(Boolean);
    }
    if (!Array.isArray(categories) || categories.length === 0) {
      return json(res, 400, { success: false, message: 'Data kategori tidak boleh kosong.' });
    }
    if (JSON.stringify(categories).length > 8 * 1024 * 1024) {
      return json(res, 413, { success: false, message: 'Data hierarki terlalu besar.' });
    }

    const now = new Date().toISOString();
    await db.collection('system_config').doc('hierarchy_master').set({
      id: 'hierarchy_master',
      value: categories,
      updatedAt: now,
      updatedBy: body.updatedBy || context.user.username || context.user.id || 'admin'
    }, { merge: true });

    return json(res, 200, {
      success: true,
      count: categories.length,
      firestoreSynced: true,
      message: `Hierarki dengan ${categories.length} kategori berhasil disimpan.`
    });
  } catch (err) {
    console.error('[hierarchyApi]', err);
    const code = String(err?.message || 'HIERARCHY_ERROR');
    const authError = ['UNAUTHENTICATED','USER_NOT_FOUND','SESSION_REVOKED','SESSION_EXPIRED','SESSION_REQUIRED'].includes(code);
    return json(res, authError ? 401 : 500, {
      success: false,
      message: authError ? 'Sesi login tidak valid atau sudah dicabut. Silakan login kembali.' : 'Gagal mengakses master hierarki.',
      code: authError ? code : 'HIERARCHY_ERROR'
    });
  }
});

exports.storageApi = onRequest({ region:'asia-southeast2', invoker:'public', cors: true, timeoutSeconds:60, memory:'512MiB' }, async (req, res) => {
  storageCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const rawUrl = String(req.originalUrl || req.url || req.path || '');
    const pathName = getStorageRequestPath(req) || rawUrl;
    const storageRoute = classifyStorageRequest(req.method, pathName);

    if (storageRoute === 'upload') {
      return await storageUpload(req, res);
    }

    if (storageRoute === 'download-path') {
      const storagePath = getStoragePathParam(pathName);
      if (!storagePath) return json(res, 400, { success:false, message:'Storage path tidak valid.' });
      req.params = { storagePath };
      return await storageDownloadByPath(req, res);
    }

    if (storageRoute === 'download-file') {
      const id = getStorageFileId(pathName);
      if (!id) return json(res, 400, { success:false, message:'File ID tidak valid.' });
      req.params = { id };
      return await storageDownload(req, res);
    }

    if (storageRoute === 'delete-file') {
      const id = getStorageFileId(pathName);
      if (!id) return json(res, 400, { success:false, message:'File ID tidak valid.' });
      req.params = { id };
      return await storageDelete(req, res);
    }

    return json(res, 404, { success:false, message:'Storage endpoint tidak ditemukan.' });
  } catch (err) {
    console.error('[storageApi]', err);
    const code = String(err?.message || '');
    const authError = ['UNAUTHENTICATED','USER_NOT_FOUND','SESSION_REVOKED','SESSION_EXPIRED','SESSION_REQUIRED'].includes(code);
    return json(res, authError ? 401 : 500, { success:false, message:authError ? 'Sesi login tidak valid atau sudah dicabut. Silakan login kembali.' : (err?.message || 'Gagal mengakses Firebase Storage.'), code:authError ? code : 'STORAGE_ERROR' });
  }
});

exports.pdfApi = onRequest({
  region: 'asia-southeast2',
  invoker: 'public',
  timeoutSeconds: 120,
  memory: '1GiB',
  cpu: 1
}, async (req, res) => {
  pdfCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return json(res, 405, { message: 'Method tidak diizinkan.' });

  let browser;
  try {
    const context = await requirePdfSession(req);
    if (!['admin', 'user'].includes(context.user.role)) {
      return json(res, 403, { message: 'Anda tidak memiliki akses untuk membuat PDF SPO.' });
    }

    const body = req.body || {};
    const documentHtml = normalizePdfFontStyles(String(body.html || ''));
    const css = String(body.css || '');
    const filename = safePdfFilename(body.filename || body.sopNumber);

    if (!documentHtml) return json(res, 400, { message: 'Dokumen SPO untuk PDF belum tersedia.' });
    if (documentHtml.length > 15 * 1024 * 1024 || css.length > 8 * 1024 * 1024) {
      return json(res, 413, { message: 'Ukuran dokumen terlalu besar untuk dibuat PDF.' });
    }

    const origin = String(req.headers.origin || '').replace(/\/$/, '');
    const baseHref = origin || String(body.baseUrl || '').replace(/\/$/, '');
    if (!baseHref) return json(res, 400, { message: 'Alamat aplikasi untuk aset dokumen tidak tersedia.' });

    const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=210mm, initial-scale=1">
<base href="${baseHref.replace(/"/g, '&quot;')}/">
<style>
${getBookmanFontFaceCss()}
${css}

/* Direct PDF contract: fixed A4, independent of the caller's device. */
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 210mm !important;
  background: #fff !important;
  color: #000 !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  font-family: "Bookman Old Style", "URW Bookman", serif !important;
}
#printable-sop-official-document, #printable-sop-official-document *, .font-bookman, .font-bookman *, .sop-batang-tubuh-title, .sop-batang-tubuh-content, .sop-batang-tubuh-content *, .rich-text-output, .rich-text-output *, .rich-text-document-content, .rich-text-document-content * {
  font-family: "Bookman Old Style", "URW Bookman", serif !important;
}
@page {
  size: A4 portrait;
  margin: 0;
}
#printable-sop-official-document {
  width: 210mm !important;
  margin: 0 !important;
  padding: 0 !important;
}
#printable-sop-official-document .sop-preview-page {
  width: 210mm !important;
  height: 297mm !important;
  min-height: 297mm !important;
  max-height: 297mm !important;
  margin: 0 !important;
  padding: 20mm 20mm 20mm 30mm !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
  break-after: page !important;
  page-break-after: always !important;
}
#printable-sop-official-document .sop-preview-page:last-child {
  break-after: auto !important;
  page-break-after: auto !important;
}
/* Official SPO table contract: preserve the exact HTML table grid. */
#printable-sop-official-document.pdf-export-document table.sop-official-table {
  display: table !important;
  width: 100% !important;
  table-layout: fixed !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  border: 1px solid #000 !important;
  background: #fff !important;
  margin: 0 !important;
}
#printable-sop-official-document.pdf-export-document .sop-official-table > thead { display: table-header-group !important; }
#printable-sop-official-document.pdf-export-document .sop-official-table > tbody { display: table-row-group !important; }
#printable-sop-official-document.pdf-export-document .sop-official-table > thead > tr > td,
#printable-sop-official-document.pdf-export-document .sop-official-table > thead > tr > th,
#printable-sop-official-document.pdf-export-document .sop-official-table > tbody > tr > td,
#printable-sop-official-document.pdf-export-document .sop-official-table > tbody > tr > th {
  display: table-cell !important;
  border: 1px solid #000 !important;
  box-sizing: border-box !important;
  vertical-align: top !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  word-wrap: break-word !important;
  hyphens: none !important;
}
#printable-sop-official-document.pdf-export-document .sop-official-table td,
#printable-sop-official-document.pdf-export-document .sop-official-table th {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.no-print { display: none !important; }
</style>
</head>
<body>
${documentHtml}
</body>
</html>`;

    const executablePath = await resolvePuppeteerExecutable();
    if (!executablePath) {
      throw new Error('Engine PDF Chromium tidak tersedia di production. Pastikan dependency @sparticuz/chromium ter-deploy atau set PUPPETEER_EXECUTABLE_PATH ke executable Chromium yang valid.');
    }

    const chromium = await getServerlessChromium();
    if (typeof chromium.setGraphicsMode === 'boolean') chromium.setGraphicsMode = false;
    const rawChromiumArgs = Array.isArray(chromium?.args) ? chromium.args : [];
    const safeChromiumArgs = rawChromiumArgs.filter(
      (arg) => typeof arg === 'string' &&
        !arg.includes('single-process') &&
        !arg.includes('in-process-gpu') &&
        !arg.includes('headless')
    );

    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({
      headless: true,
      pipe: true,
      executablePath,
      defaultViewport: chromium?.defaultViewport || { width: 1280, height: 900 },
      args: [
        ...safeChromiumArgs,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--font-render-hinting=none'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.evaluate(`
      (async () => {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const images = Array.from(document.images || []);
        await Promise.all(images.map(function(img) {
          if (img.complete) return Promise.resolve();
          return new Promise(function(resolve) {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }));
      })()
    `);

    // Let fonts/images/layout settle before measuring. Browser layout can differ by a few
    // fractional pixels because of font rasterization and device-scale rounding.
    await page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));

    // Keep a small diagnostic guard, but do not reject harmless sub-pixel/few-pixel
    // rounding differences. The application-generated .sop-preview-page pagination
    // remains authoritative; large overflow is logged for diagnosis rather than turning
    // a valid PDF request into a false-negative production failure.
    const pageOverflow = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll('.sop-preview-page'));
      return pages.map((el, index) => ({
        index: index + 1,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        overflowPx: Math.max(0, el.scrollHeight - el.clientHeight),
      })).filter(item => item.overflowPx > 6);
    });
    if (pageOverflow.length) {
      const details = pageOverflow.map(item => `halaman ${item.index}: +${Math.ceil(item.overflowPx)}px`).join(', ');
      console.warn(`[PDF] Large page overflow detected; continuing with application pagination: ${details}`);
    }

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    await browser.close();
    browser = null;

    res.status(200);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.send(pdf);
  } catch (error) {
    console.error('pdfApi failed', error);
    if (browser) {
      try { await browser.close(); } catch {}
    }
    const code = String(error?.message || error?.code || 'PDF_RENDER_ERROR');
    const authError =
      code === 'UNAUTHENTICATED' ||
      code === 'USER_NOT_FOUND' ||
      code === 'SESSION_REVOKED' ||
      code === 'SESSION_REQUIRED' ||
      code.startsWith('auth/') ||
      code.includes('token') ||
      code.includes('UNAUTHENTICATED');
    const message = authError
      ? 'Sesi login tidak valid atau sudah dicabut. Silakan login kembali.'
      : `PDF gagal dibuat: ${code}`;
    console.error('pdfApi diagnostic:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    return json(res, authError ? 401 : 500, {
      success: false,
      message,
      code: authError ? code : 'PDF_RENDER_ERROR',
      detail: authError ? undefined : String(error?.message || error?.code || 'Unknown PDF renderer error')
    });
  }
});
