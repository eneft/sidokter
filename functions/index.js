const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const puppeteer = require('puppeteer-core');

if (!process.env.AWS_EXECUTION_ENV) {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
}

let chromiumModulePromise = null;
let cachedStandardCss = null;

async function getServerlessChromium() {
  if (!chromiumModulePromise) {
    chromiumModulePromise = (async () => {
      const mod = await import('@sparticuz/chromium');
      const chromium = mod.default || mod;

      const al2023Lib = path.join(os.tmpdir(), 'al2023', 'lib');
      const nsprPath = path.join(al2023Lib, 'libnspr4.so');

      if (!fs.existsSync(nsprPath) && typeof mod.inflate === 'function') {
        try {
          const binDir = path.join(process.cwd(), 'node_modules', '@sparticuz/chromium', 'bin');
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

admin.initializeApp();
const db = admin.firestore();
const USERS = 'users';
const AUTH_LOGS = 'auth_logs';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;

function json(res, status, payload) {
  res.status(status).set('Cache-Control', 'no-store').json(payload);
}

function cors(req, res) {
  const origin = req.headers.origin;
  const allowed = process.env.AUTH_ALLOWED_ORIGIN;
  if (origin && allowed && origin === allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Soegiri-Auth-Uid, X-Soegiri-Session-Id, X-Soegiri-Username');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
    subUnitCode: user.data.subUnitCode
  };
}

async function requireAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new Error('UNAUTHENTICATED');
  const decoded = await admin.auth().verifyIdToken(header.slice(7), true);
  const userRef = db.collection(USERS).doc(decoded.uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error('USER_NOT_FOUND');
  const user = { ...snap.data(), role: normalizeRole(snap.data().role) };
  if (!decoded.sessionId || user.activeSessionId !== decoded.sessionId) throw new Error('SESSION_REVOKED');
  return { decoded, ref: userRef, user };
}

exports.authApi = onRequest({ region: 'asia-southeast2', invoker: 'public', timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return json(res, 405, { message: 'Method tidak diizinkan.' });

  try {
    const action = req.path.replace(/^\/+/, '').split('/').pop() || req.body?.action;

    if (action === 'login') {
      const username = normalizeUsername(req.body?.username);
      const password = String(req.body?.password || '');
      if (!username || !password) return json(res, 400, { message: 'Nama pengguna dan kata sandi wajib diisi.' });

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

      let valid = false;
      if (user.passwordHash && user.passwordSalt) {
        valid = verifyPassword(password, user.passwordHash, user.passwordSalt);
      } else if (typeof user.password === 'string' && user.password === password) {
        // One-time server-side migration for old accounts. Plaintext is never
        // returned to the browser and is deleted immediately after hashing.
        const salt = crypto.randomBytes(16);
        const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
        await db.collection(USERS).doc(id).update({ passwordHash: hash, passwordSalt: salt.toString('hex'), password: admin.firestore.FieldValue.delete() });
        user.passwordHash = hash;
        user.passwordSalt = salt.toString('hex');
        valid = true;
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

      const sessionId = crypto.randomUUID();
      const sessionCreatedAt = now;
      await db.collection(USERS).doc(id).update({
        activeSessionId: sessionId,
        sessionCreatedAt,
        lastLoginAt: new Date().toISOString(),
        failedLoginAttempts: 0,
        lockoutUntil: 0
      });
      await db.collection('session_states').doc(id).set({
        activeSessionId: sessionId,
        updatedAt: new Date().toISOString()
      });

      await audit({ username, name: user.name, role: user.role, sessionId, event: 'LOGIN_SUCCESS', details: 'Login berhasil melalui trusted authentication service.' });
      const customToken = await admin.auth().createCustomToken(id, {
        role: user.role,
        username: user.username,
        sessionId
      });

      return json(res, 200, { success: true, customToken, session: publicSession(found, sessionId, sessionCreatedAt), message: 'Login berhasil.' });
    }

    const context = await requireAuth(req);

    if (action === 'logout') {
      const sessionId = String(req.body?.sessionId || '');
      if (sessionId && sessionId === context.user.activeSessionId) {
        await context.ref.update({ activeSessionId: null, sessionCreatedAt: null });
        await db.collection('session_states').doc(context.decoded.uid).delete();
      }
      await audit({ username: context.user.username, name: context.user.name, role: context.user.role, sessionId, event: 'LOGOUT', details: 'Logout manual.' });
      return json(res, 200, { success: true, message: 'Logout berhasil.' });
    }

    if (action === 'revoke-all') {
      await context.ref.update({ activeSessionId: null, sessionCreatedAt: null, updatedAt: new Date().toISOString() });
      await db.collection('session_states').doc(context.decoded.uid).delete();
      await audit({ username: context.user.username, name: context.user.name, role: context.user.role, event: 'SESSION_REVOKED', details: 'Seluruh sesi aktif dicabut.' });
      return json(res, 200, { success: true, message: 'Seluruh sesi aktif akun telah dicabut.' });
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
      if (!existing && !password) return json(res, 400, { message: 'Kata sandi wajib diisi untuk akun baru.' });
      if (userId === context.decoded.uid && role !== 'admin') return json(res, 400, { message: 'Akun Administrator aktif tidak boleh diturunkan menjadi User.' });

      const allowedProfile = {
        id: userId,
        username,
        name,
        role,
        divisionCode: role === 'admin' ? (incoming.divisionCode || 'ALL') : incoming.divisionCode,
        subCode: role === 'admin' ? admin.firestore.FieldValue.delete() : (incoming.subCode || null),
        instCode: role === 'admin' ? admin.firestore.FieldValue.delete() : (incoming.instCode || null),
        poliCode: role === 'admin' ? admin.firestore.FieldValue.delete() : (incoming.poliCode || null),
        subUnitCode: role === 'admin' ? admin.firestore.FieldValue.delete() : (incoming.subUnitCode || null),
        unitName: String(incoming.unitName || 'Unit Kerja RSUD Dr. Soegiri'),
        createdAt: existing?.createdAt || incoming.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const update = { ...allowedProfile };
      if (password) {
        const salt = crypto.randomBytes(16);
        update.passwordHash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
        update.passwordSalt = salt.toString('hex');
        update.password = admin.firestore.FieldValue.delete();
        // A password reset invalidates the existing session.
        update.activeSessionId = null;
        update.sessionCreatedAt = null;
      }

      await ref.set(update, { merge: true });
      if (password) await db.collection('session_states').doc(userId).delete();
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
      await db.collection('session_states').doc(userId).delete();
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
      if (!verifyPassword(currentPassword, context.user.passwordHash, context.user.passwordSalt)) {
        return json(res, 401, { message: 'Kata sandi lama yang Anda masukkan salah.' });
      }
      const salt = crypto.randomBytes(16);
      const hash = crypto.pbkdf2Sync(newPassword, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
      await context.ref.update({ passwordHash: hash, passwordSalt: salt.toString('hex'), updatedAt: new Date().toISOString() });
      await audit({ username: context.user.username, name: context.user.name, role: context.user.role, event: 'PASSWORD_CHANGED', details: 'Kata sandi berhasil diganti.' });
      return json(res, 200, { success: true, message: 'Kata sandi Anda berhasil diperbarui.' });
    }

    return json(res, 404, { message: 'Endpoint autentikasi tidak ditemukan.' });
  } catch (error) {
    console.error('authApi error', error);
    const message = error?.message === 'SESSION_REVOKED' ? 'Sesi Anda sudah dicabut. Silakan login kembali.' : 'Layanan autentikasi gagal memproses permintaan.';
    return json(res, error?.message === 'SESSION_REVOKED' ? 401 : 500, { message });
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
  const origin = req.headers.origin;
  const allowed = process.env.AUTH_ALLOWED_ORIGIN;
  if (origin && allowed && origin === allowed) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Soegiri-Auth-Uid, X-Soegiri-Session-Id, X-Soegiri-Username');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function requirePdfSession(req) {
  const authUid = String(req.headers['x-soegiri-auth-uid'] || '').trim();
  const sessionId = String(req.headers['x-soegiri-session-id'] || '').trim();
  const username = normalizeUsername(req.headers['x-soegiri-username'] || '');

  if (!authUid || !sessionId || !username) throw new Error('UNAUTHENTICATED');

  const userRef = db.collection(USERS).doc(authUid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error('USER_NOT_FOUND');

  const user = snap.data();
  if (normalizeUsername(user.username) !== username) throw new Error('UNAUTHENTICATED');
  if (!user.activeSessionId || user.activeSessionId !== sessionId) throw new Error('SESSION_REVOKED');

  return { authUid, sessionId, username, ref: userRef, user };
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
    const documentHtml = String(body.html || '');
    const css = String(body.css || '');
    const filename = safePdfFilename(body.filename || body.sopNumber);

    if (!documentHtml) return json(res, 400, { message: 'Dokumen SPO untuk PDF belum tersedia.' });
    if (documentHtml.length > 8 * 1024 * 1024 || css.length > 8 * 1024 * 1024) {
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
  font-family: "Times New Roman", Times, "Liberation Serif", "Nimbus Roman", Georgia, serif !important;
}
#printable-sop-official-document, #printable-sop-official-document *, .font-bookman, .font-bookman *, .sop-batang-tubuh-title, .sop-batang-tubuh-content, .sop-batang-tubuh-content *, .rich-text-output, .rich-text-output *, .rich-text-document-content, .rich-text-document-content * {
  font-family: "Times New Roman", Times, "Liberation Serif", "Nimbus Roman", Georgia, serif !important;
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
      (arg) => typeof arg === 'string' && !arg.includes('single-process')
    );

    browser = await puppeteer.launch({
      headless: 'shell',
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
    const code = error?.message || error?.code || 'PDF_RENDER_ERROR';
    const authError = code === 'UNAUTHENTICATED' || code === 'USER_NOT_FOUND' || code === 'SESSION_REVOKED';
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
