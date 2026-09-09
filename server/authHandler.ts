import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Request, Response } from 'express';

const PBKDF2_ITERATIONS = 100000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_MAX = 20;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUTH_DB_FILE = path.resolve(DATA_DIR, 'auth_db.json');

const CONFIG_FILE = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firestoreProjectId = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0880840770';
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (parsed.projectId) firestoreProjectId = parsed.projectId;
  }
} catch {}

const PRIMARY_CLOUD_AUTH_API_URL = 'https://authapi-n7zygxitla-et.a.run.app';
const SECONDARY_CLOUD_AUTH_API_URL = `https://asia-southeast2-${firestoreProjectId}.cloudfunctions.net/authApi`;

const CLOUD_AUTH_API_URL =
  (process.env.UPSTREAM_AUTH_API_URL && process.env.UPSTREAM_AUTH_API_URL.startsWith('http'))
    ? process.env.UPSTREAM_AUTH_API_URL
    : ((process.env.AUTH_API_URL && process.env.AUTH_API_URL.startsWith('http'))
        ? process.env.AUTH_API_URL
        : ((process.env.VITE_AUTH_API_URL && process.env.VITE_AUTH_API_URL.startsWith('http'))
            ? process.env.VITE_AUTH_API_URL
            : PRIMARY_CLOUD_AUTH_API_URL));

interface UserRecord {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  divisionCode?: string;
  divisionCodes?: string[];
  assignments?: any[];
  badges?: string[];
  unitName?: string;
  subCode?: string;
  instCode?: string;
  poliCode?: string;
  subUnitCode?: string;
  createdAt: string;
  updatedAt: string;
  credentialStatus: 'ACTIVE' | 'PASSWORD_REQUIRED';
  failedLoginAttempts?: number;
  lockoutUntil?: number;
  lastLoginAt?: string;
}

interface CredentialRecord {
  passwordHash: string;
  passwordSalt: string;
  updatedAt: string;
}

interface SessionRecord {
  sessionId: string;
  authUid: string;
  username: string;
  createdAt: number;
  lastActiveAt: number;
  revoked: boolean;
  userAgent?: string;
  ip?: string;
}

interface AuthDb {
  users: Record<string, UserRecord>;
  credentials: Record<string, CredentialRecord>;
  sessions: Record<string, SessionRecord>;
  auditLogs: any[];
}

const loginRate = new Map<string, { count: number; resetAt: number }>();

function ensureDbLoaded(): AuthDb {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(AUTH_DB_FILE)) {
      const content = fs.readFileSync(AUTH_DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.users === 'object' && typeof parsed.credentials === 'object') {
        if (!parsed.sessions) parsed.sessions = {};
        if (!parsed.auditLogs) parsed.auditLogs = [];
        return parsed;
      }
    }
  } catch (err) {
    console.error('[authHandler] Error loading auth db, reinitializing:', err);
  }

  // Fresh local auth starts empty. Admin provisioning must use an explicit server-side setup secret.
  const now = new Date().toISOString();

  const initialDb: AuthDb = {
    users: {},
    credentials: {},
    sessions: {},
    auditLogs: []
  };
  saveDb(initialDb);
  return initialDb;
}

let authDb: AuthDb = ensureDbLoaded();

function saveDb(db: AuthDb) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(AUTH_DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('[authHandler] Error saving auth db:', err);
  }
}

function normalizeRole(role: any): 'admin' | 'user' {
  return String(role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function normalizeUsername(val: any): string {
  return String(val || '').trim().toLowerCase();
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function hashPassword(password: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
  return { hash, salt: salt.toString('hex') };
}

function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  if (!storedHash || !storedSalt) return false;
  const derived = crypto.pbkdf2Sync(password, Buffer.from(storedSalt, 'hex'), PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
  return safeEqualHex(derived, storedHash);
}

function validStrongPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
}

function requestIp(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.ip || 'unknown');
}

function checkLoginRate(req: Request, username: string) {
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

function publicSession(user: UserRecord, sessionId: string, createdAt: number) {
  return {
    authUid: user.id,
    username: user.username,
    name: user.name,
    role: normalizeRole(user.role),
    sessionId,
    sessionCreatedAt: createdAt,
    lastActiveAt: createdAt,
    unitName: user.unitName || 'Unit Kerja RSUD Dr. Soegiri',
    divisionCode: user.divisionCode || (normalizeRole(user.role) === 'admin' ? 'ALL' : 'PEL'),
    divisionCodes: Array.isArray(user.divisionCodes) ? user.divisionCodes : [user.divisionCode || 'PEL'],
    assignments: Array.isArray(user.assignments) ? user.assignments : [],
    badges: Array.isArray(user.badges) ? user.badges : [],
    subCode: user.subCode,
    instCode: user.instCode,
    poliCode: user.poliCode,
    subUnitCode: user.subUnitCode
  };
}

export function getActiveSessionByToken(tokenOrSessionId: string): { user: UserRecord; session: SessionRecord } | null {
  if (!tokenOrSessionId) return null;
  authDb = ensureDbLoaded();

  // Only a server-issued session ID is accepted here. A Firebase JWT (or any
  // other client token) must never be treated as authenticated merely because
  // its payload can be decoded.
  let session = authDb.sessions[tokenOrSessionId];
  if (!session) {
    session = Object.values(authDb.sessions).find(
      s => s.sessionId === tokenOrSessionId || `session-${s.sessionId}` === tokenOrSessionId
    );
  }

  if (!session || session.revoked) return null;
  const user = authDb.users[session.authUid];
  if (!user) return null;

  session.lastActiveAt = Date.now();
  saveDb(authDb);
  return { user, session };
}

export async function verifyServerSession(req: Request): Promise<{ authUid: string; username: string; role: string; badges: string[]; assignments: any[]; divisionCode?: string; divisionCodes?: string[]; subCode?: string; instCode?: string; poliCode?: string; subUnitCode?: string }> {
  const header = String(req.headers.authorization || '');
  const xSessionId = String(req.headers['x-session-id'] || '');

  // The application server trusts only a session record issued by the
  // trusted auth service. A raw/decoded JWT payload is never treated as
  // authenticated because decoding a JWT does not verify its signature.
  if (xSessionId) {
    const active = getActiveSessionByToken(xSessionId);
    if (active) {
      return {
        authUid: active.user.id,
        username: active.user.username,
        role: active.user.role,
        badges: Array.isArray(active.user.badges) ? active.user.badges : [],
        assignments: Array.isArray(active.user.assignments) ? active.user.assignments : [],
        divisionCode: active.user.divisionCode,
        divisionCodes: Array.isArray(active.user.divisionCodes) ? active.user.divisionCodes : [],
        subCode: active.user.subCode,
        instCode: active.user.instCode,
        poliCode: active.user.poliCode,
        subUnitCode: active.user.subUnitCode
      };
    }
    throw new Error('SESSION_REVOKED');
  }

  // Legacy bearer-only callers are intentionally rejected until they also
  // provide a server-issued SIDOKTER session. This closes the unsigned JWT
  // payload trust vulnerability.
  if (header.startsWith('Bearer ')) throw new Error('SESSION_REQUIRED');
  throw new Error('UNAUTHENTICATED');
}

export async function handleAuthApi(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method tidak diizinkan.' });
  }

  authDb = ensureDbLoaded();
  const pathSegment = req.path.replace(/^\/+/, '').split('/').pop();
  const action = (pathSegment && pathSegment !== 'auth' && pathSegment !== 'authApi')
    ? pathSegment
    : (req.body?.action || pathSegment);

  try {
    // Forward auth requests to the live upstream Firebase Cloud Function.
    // This provides official RS256-signed Firebase Custom Tokens and synchronizes with Firestore.
    if (CLOUD_AUTH_API_URL) {
      try {
        const forwardHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };
        if (req.headers.authorization) {
          forwardHeaders['Authorization'] = String(req.headers.authorization);
        }
        if (req.headers['x-session-id']) {
          forwardHeaders['X-Session-Id'] = String(req.headers['x-session-id']);
        }
        if (req.headers['user-agent']) {
          forwardHeaders['User-Agent'] = String(req.headers['user-agent']);
        }

        const timeoutMs = action === 'user-list' ? 45000 : 25000;
        const candidateUrls = [CLOUD_AUTH_API_URL];
        if (SECONDARY_CLOUD_AUTH_API_URL && !candidateUrls.includes(SECONDARY_CLOUD_AUTH_API_URL)) {
          candidateUrls.push(SECONDARY_CLOUD_AUTH_API_URL);
        }

        let cloudRes: globalThis.Response | null = null;
        let lastError: any = null;

        for (const candidateUrl of candidateUrls) {
          try {
            cloudRes = await fetch(candidateUrl, {
              method: 'POST',
              headers: forwardHeaders,
              body: JSON.stringify({ action, ...req.body }),
              signal: AbortSignal.timeout(timeoutMs)
            });
            if (cloudRes) break;
          } catch (err: any) {
            lastError = err;
            console.warn(`[authHandler] Candidate upstream ${candidateUrl} notice:`, err?.message);
          }
        }

        if (!cloudRes) {
          throw lastError || new Error('No upstream response');
        }

        const contentType = cloudRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await cloudRes.json();
          // If login succeeded, cache session in memory for local /api/pdf authentication
          if (cloudRes.ok && data?.success && data?.session) {
            try {
              authDb = ensureDbLoaded();
              const sessionUser = data.session;
              const userId = sessionUser.authUid || sessionUser.id || 'admin-root';
              authDb.users[userId] = {
                id: userId,
                username: sessionUser.username,
                name: sessionUser.name || sessionUser.username,
                role: sessionUser.role || 'user',
                divisionCode: sessionUser.divisionCode || 'ALL',
                divisionCodes: sessionUser.divisionCodes || ['ALL'],
                assignments: sessionUser.assignments || [],
                badges: sessionUser.badges || [],
                unitName: sessionUser.unitName || 'RSUD Dr. Soegiri Lamongan',
                createdAt: new Date(sessionUser.sessionCreatedAt || Date.now()).toISOString(),
                updatedAt: new Date().toISOString(),
                credentialStatus: 'ACTIVE'
              };
              if (sessionUser.sessionId) {
                authDb.sessions[sessionUser.sessionId] = {
                  sessionId: sessionUser.sessionId,
                  authUid: userId,
                  username: sessionUser.username,
                  createdAt: sessionUser.sessionCreatedAt || Date.now(),
                  lastActiveAt: sessionUser.lastActiveAt || Date.now(),
                  revoked: false,
                  userAgent: String(req.headers['user-agent'] || 'client')
                };
              }
            } catch (cacheErr) {
              console.warn('[authHandler] Non-fatal session cache warning:', cacheErr);
            }
          }

          // If upstream succeeded, return immediately
          if (cloudRes.ok && data?.success) {
            return res.status(cloudRes.status).json(data);
          }
          // If login failed due to invalid credentials, pass through the warning
          if (action === 'login' && cloudRes.status === 401 && data?.message) {
            return res.status(401).json(data);
          }
          console.warn(`[authHandler] Upstream returned status ${cloudRes.status} for '${action}', falling back to local database:`, data?.message || 'non-ok');
        } else {
          console.warn(`[authHandler] Upstream returned non-JSON ${cloudRes.status} for '${action}', falling back to local database`);
        }
      } catch (proxyError: any) {
        console.warn('[authHandler] Upstream Cloud Function unavailable, using local database fallback:', proxyError?.message);
      }
    }

    const localFallbackEnabled = String(process.env.SIDOKTER_LOCAL_AUTH_FALLBACK || '').toLowerCase() === 'true';
    if (!localFallbackEnabled) {
      return res.status(503).json({ message: 'Layanan autentikasi utama tidak tersedia.' });
    }

    // -------------------------------------------------------------
    // ACTION: BOOTSTRAP-ADMIN
    // -------------------------------------------------------------
    if (action === 'bootstrap-admin') {
      const setupSecret = String(req.body?.setupSecret || '').trim();
      const password = String(req.body?.password || '');
      const configuredSecret = String(process.env.SIDOKTER_BOOTSTRAP_SECRET || '').trim();

      // Never use a built-in bootstrap secret. Local bootstrap is available only when explicitly configured.
      if (!configuredSecret) {
        return res.status(503).json({ message: 'Provisioning Admin belum dikonfigurasi server.' });
      }

      const isValidSecret = safeEqualHex(
        crypto.createHash('sha256').update(setupSecret).digest('hex'),
        crypto.createHash('sha256').update(configuredSecret).digest('hex')
      );

      if (!isValidSecret) {
        return res.status(403).json({ message: 'Setup key tidak valid.' });
      }

      if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).json({
          message: 'Password Admin minimal 8 karakter dan wajib mengandung huruf besar, huruf kecil, dan angka.'
        });
      }

      const existingAdmin = Object.values(authDb.users).find(u => normalizeRole(u.role) === 'admin');
      const now = new Date().toISOString();
      const adminId = existingAdmin ? existingAdmin.id : `admin-${crypto.randomUUID()}`;
      const { hash, salt } = hashPassword(password);

      authDb.users[adminId] = {
        id: adminId,
        username: 'admin',
        name: 'Administrator SIDOKTER',
        role: 'admin',
        divisionCode: 'ALL',
        divisionCodes: ['ALL'],
        assignments: [],
        badges: [],
        unitName: 'RSUD Dr. Soegiri Lamongan',
        createdAt: existingAdmin?.createdAt || now,
        updatedAt: now,
        credentialStatus: 'ACTIVE',
        failedLoginAttempts: 0,
        lockoutUntil: 0
      };

      authDb.credentials[adminId] = {
        passwordHash: hash,
        passwordSalt: salt,
        updatedAt: now
      };

      saveDb(authDb);

      return res.status(200).json({
        success: true,
        message: 'Administrator berhasil disetup. Silakan login dengan username: admin dan password yang baru Anda buat.',
        username: 'admin'
      });
    }

    // -------------------------------------------------------------
    // ACTION: LOGIN
    // -------------------------------------------------------------
    if (action === 'login') {
      const username = normalizeUsername(req.body?.username);
      const password = String(req.body?.password || '');

      if (!username || !password) {
        return res.status(400).json({ message: 'Nama pengguna dan kata sandi wajib diisi.' });
      }

      const rate = checkLoginRate(req, username);
      if (!rate.allowed) {
        return res.status(429).json({
          message: `Terlalu banyak percobaan login. Coba lagi dalam sekitar ${rate.retryAfter} menit.`,
          lockedOut: true,
          remainingMinutes: rate.retryAfter
        });
      }

      const user = Object.values(authDb.users).find(u => normalizeUsername(u.username) === username);
      if (!user) {
        return res.status(401).json({ message: 'Nama pengguna atau kata sandi tidak valid.' });
      }

      const now = Date.now();
      if (user.lockoutUntil && user.lockoutUntil > now) {
        const remainingMinutes = Math.ceil((user.lockoutUntil - now) / 60000);
        return res.status(429).json({
          message: `Akun terkunci sementara. Silakan coba lagi dalam ${remainingMinutes} menit.`,
          lockedOut: true,
          remainingMinutes
        });
      }

      const credential = authDb.credentials[user.id];
      if (!credential?.passwordHash || !credential?.passwordSalt) {
        return res.status(403).json({
          message: 'Akun belum memiliki password aktif. Hubungi Administrator untuk menetapkan kata sandi.'
        });
      }

      const valid = verifyPassword(password, credential.passwordHash, credential.passwordSalt);
      if (!valid) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const locked = attempts >= MAX_FAILED_ATTEMPTS;
        user.failedLoginAttempts = locked ? 0 : attempts;
        user.lockoutUntil = locked ? now + LOCKOUT_MS : 0;
        saveDb(authDb);

        if (locked) {
          return res.status(429).json({
            message: 'Akun Anda dikunci sementara selama 15 menit karena terlalu banyak percobaan login gagal.',
            lockedOut: true,
            remainingMinutes: 15
          });
        }
        return res.status(401).json({
          message: `Kata sandi salah. Sisa kesempatan: ${MAX_FAILED_ATTEMPTS - attempts} kali.`
        });
      }

      // Reset lockout counter on success
      user.failedLoginAttempts = 0;
      user.lockoutUntil = 0;
      user.lastLoginAt = new Date().toISOString();

      const sessionId = `sess_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      const sessionCreatedAt = now;

      // Register session
      authDb.sessions[sessionId] = {
        sessionId,
        authUid: user.id,
        username: user.username,
        createdAt: sessionCreatedAt,
        lastActiveAt: sessionCreatedAt,
        revoked: false,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        ip: requestIp(req)
      };

      saveDb(authDb);

      const session = publicSession(user, sessionId, sessionCreatedAt);

      return res.status(200).json({
        success: true,
        session,
        customToken: sessionId,
        message: 'Login berhasil.'
      });
    }

    // -------------------------------------------------------------
    // PROTECTED ACTIONS: REQUIRE AUTHENTICATION
    // -------------------------------------------------------------
    const authHeader = String(req.headers.authorization || '');
    const xSessionId = String(req.headers['x-session-id'] || '');

    let token = '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (xSessionId) {
      token = xSessionId.trim();
    }

    // Protected actions accept only a server-issued SIDOKTER session.
    // User-id/username headers are metadata only and can never authenticate a request.
    let activeAuth = xSessionId ? getActiveSessionByToken(xSessionId) : null;
    if (!activeAuth && token && token !== xSessionId) {
      activeAuth = getActiveSessionByToken(token);
    }

    // -------------------------------------------------------------
    // ACTION: SESSION (Check/Validate)
    // -------------------------------------------------------------
    if (action === 'session') {
      if (!activeAuth) {
        return res.status(401).json({ message: 'Sesi login tidak valid atau sudah kedaluwarsa.' });
      }
      const session = publicSession(activeAuth.user, activeAuth.session.sessionId, activeAuth.session.createdAt);
      return res.status(200).json({ success: true, session });
    }

    // -------------------------------------------------------------
    // ACTION: LOGOUT
    // -------------------------------------------------------------
    if (action === 'logout') {
      const sessionId = String(req.body?.sessionId || activeAuth?.session.sessionId || '');
      if (sessionId && authDb.sessions[sessionId]) {
        authDb.sessions[sessionId].revoked = true;
        saveDb(authDb);
      }
      return res.status(200).json({ success: true, message: 'Logout berhasil.' });
    }

    // -------------------------------------------------------------
    // ACTION: REVOKE-ALL
    // -------------------------------------------------------------
    if (action === 'revoke-all') {
      if (!activeAuth) {
        return res.status(401).json({ message: 'UNAUTHENTICATED' });
      }
      Object.values(authDb.sessions).forEach(s => {
        if (s.authUid === activeAuth.user.id) s.revoked = true;
      });
      saveDb(authDb);
      return res.status(200).json({ success: true, message: 'Seluruh sesi aktif akun telah dicabut.' });
    }

    // -------------------------------------------------------------
    // ACTION: CHANGE-PASSWORD
    // -------------------------------------------------------------
    if (action === 'change-password') {
      if (!activeAuth) {
        return res.status(401).json({ message: 'UNAUTHENTICATED' });
      }
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '').trim();

      if (!validStrongPassword(newPassword)) {
        return res.status(400).json({
          message: 'Kata sandi baru minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, serta angka.'
        });
      }

      const cred = authDb.credentials[activeAuth.user.id];
      if (!cred || !verifyPassword(currentPassword, cred.passwordHash, cred.passwordSalt)) {
        return res.status(401).json({ message: 'Kata sandi saat ini tidak valid.' });
      }

      const { hash, salt } = hashPassword(newPassword);
      authDb.credentials[activeAuth.user.id] = {
        passwordHash: hash,
        passwordSalt: salt,
        updatedAt: new Date().toISOString()
      };
      saveDb(authDb);

      return res.status(200).json({ success: true, message: 'Kata sandi berhasil diperbarui.' });
    }

    // -------------------------------------------------------------
    // ACTION: USER-LIST (Admin only)
    // -------------------------------------------------------------
    if (action === 'user-list') {
      // Admin Root access MUST come from a valid server-issued session.
      // Never infer administrator privileges from username, session-id text,
      // or a decodable client token.
      if (!activeAuth || activeAuth.user.role !== 'admin') {
        return res.status(403).json({ message: 'Hanya Administrator yang dapat melihat daftar akun.' });
      }
      const users = Object.values(authDb.users)
        .filter(u => u.username !== 'guest')
        .map(u => ({
          id: u.id,
          username: u.username,
          name: u.name || u.username,
          role: normalizeRole(u.role),
          unitName: u.unitName,
          divisionCode: u.divisionCode,
          divisionCodes: u.divisionCodes,
          assignments: u.assignments,
          badges: u.badges,
          subCode: u.subCode,
          instCode: u.instCode,
          poliCode: u.poliCode,
          subUnitCode: u.subUnitCode,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          credentialStatus: authDb.credentials[u.id] ? 'ACTIVE' : 'PASSWORD_REQUIRED'
        }));

      return res.status(200).json({ success: true, users });
    }

    // -------------------------------------------------------------
    // ACTION: USER-SAVE (Admin only)
    // -------------------------------------------------------------
    if (action === 'user-save') {
      if (!activeAuth || activeAuth.user.role !== 'admin') {
        return res.status(403).json({ message: 'Hanya Administrator yang dapat mengelola akun.' });
      }

      const incoming = req.body?.user || {};
      const userId = String(incoming.id || `user-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`).trim();
      const username = normalizeUsername(incoming.username);
      const name = String(incoming.name || '').trim();
      const role = incoming.role === 'admin' ? 'admin' : 'user';
      const password = String(req.body?.password || '').trim();

      if (!username || !name) {
        return res.status(400).json({ message: 'Data akun belum lengkap.' });
      }

      if (password && !validStrongPassword(password)) {
        return res.status(400).json({
          message: 'Kata sandi minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, serta angka.'
        });
      }

      // Check username collision
      const existingUserWithUsername = Object.values(authDb.users).find(
        u => normalizeUsername(u.username) === username && u.id !== userId
      );
      if (existingUserWithUsername) {
        return res.status(409).json({ message: 'Username tersebut sudah digunakan.' });
      }

      const existing = authDb.users[userId];
      if (!existing && !password) {
        return res.status(400).json({ message: 'Kata sandi wajib diisi untuk akun baru.' });
      }

      const now = new Date().toISOString();
      authDb.users[userId] = {
        id: userId,
        username,
        name,
        role,
        divisionCode: role === 'admin' ? 'ALL' : incoming.divisionCode,
        divisionCodes: role === 'admin' ? ['ALL'] : (Array.isArray(incoming.divisionCodes) ? incoming.divisionCodes : [incoming.divisionCode || 'PEL']),
        assignments: role === 'admin' ? [] : (Array.isArray(incoming.assignments) ? incoming.assignments : []),
        badges: role === 'admin' ? [] : (Array.isArray(incoming.badges) ? incoming.badges : []),
        subCode: incoming.subCode,
        instCode: incoming.instCode,
        poliCode: incoming.poliCode,
        subUnitCode: incoming.subUnitCode,
        unitName: String(incoming.unitName || 'Unit Kerja RSUD Dr. Soegiri'),
        createdAt: existing?.createdAt || incoming.createdAt || now,
        updatedAt: now,
        credentialStatus: password || authDb.credentials[userId] ? 'ACTIVE' : 'PASSWORD_REQUIRED',
        failedLoginAttempts: 0,
        lockoutUntil: 0
      };

      if (password) {
        const { hash, salt } = hashPassword(password);
        authDb.credentials[userId] = {
          passwordHash: hash,
          passwordSalt: salt,
          updatedAt: now
        };
      }

      saveDb(authDb);

      return res.status(200).json({
        success: true,
        message: existing ? 'Akun berhasil diperbarui.' : 'Akun berhasil dibuat.'
      });
    }

    // -------------------------------------------------------------
    // ACTION: USER-DELETE (Admin only)
    // -------------------------------------------------------------
    if (action === 'user-delete') {
      if (!activeAuth || activeAuth.user.role !== 'admin') {
        return res.status(403).json({ message: 'Hanya Administrator yang dapat mengelola akun.' });
      }
      const userId = String(req.body?.userId || '').trim();
      if (!userId) return res.status(400).json({ message: 'User ID wajib diisi.' });

      if (userId === activeAuth.user.id) {
        return res.status(400).json({ message: 'Tidak dapat menghapus akun Anda sendiri saat sedang aktif.' });
      }

      delete authDb.users[userId];
      delete authDb.credentials[userId];
      Object.values(authDb.sessions).forEach(s => {
        if (s.authUid === userId) s.revoked = true;
      });
      saveDb(authDb);

      return res.status(200).json({ success: true, message: 'Akun berhasil dihapus.' });
    }

    // -------------------------------------------------------------
    // ACTION: USER-RESTORE-PROFILE (Admin only)
    // -------------------------------------------------------------
    if (action === 'user-restore-profile') {
      if (!activeAuth || activeAuth.user.role !== 'admin') {
        return res.status(403).json({ message: 'Hanya Administrator yang dapat memulihkan akun.' });
      }
      const incoming = req.body?.user || {};
      const userId = String(incoming.id || '').trim();
      if (!userId || !incoming.username) {
        return res.status(400).json({ message: 'Data akun tidak lengkap untuk pemulihan.' });
      }
      const now = new Date().toISOString();
      authDb.users[userId] = {
        ...incoming,
        id: userId,
        updatedAt: now,
        credentialStatus: authDb.credentials[userId] ? 'ACTIVE' : 'PASSWORD_REQUIRED'
      };
      saveDb(authDb);
      return res.status(200).json({ success: true, message: 'Profil akun berhasil dipulihkan.' });
    }

    return res.status(400).json({ message: `Action tidak dikenal: ${action}` });
  } catch (err: any) {
    console.error('[handleAuthApi] Error handling auth request:', err);
    return res.status(500).json({ message: err?.message || 'Terjadi kesalahan internal pada server autentikasi.' });
  }
}
