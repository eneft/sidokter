import { UserAccount, UserSession, UserAssignment, LoginAuditLog } from '../types';
import { auth, authPersistenceReady, firebaseConfig } from './firebase';
import { signInWithCustomToken, signOut } from 'firebase/auth';

const CLIENT_SESSION_STORAGE_KEY='soegiri_sop_client_session_v3';
const AUDIT_KEY='soegiri_offline_audit_v1';
export const MAX_FAILED_ATTEMPTS=5;
export const LOCKOUT_DURATION_MS=15*60*1000;
export const IDLE_TIMEOUT_MS=30*60*1000;
export const ABSOLUTE_TIMEOUT_MS=12*60*60*1000;

export function normalizeRole(role: unknown): UserAccount['role'] {
  return String(role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function normalizeAssignments(user: Partial<UserAccount>):UserAssignment[]{
  const raw=(Array.isArray(user.assignments)&&user.assignments.length)?user.assignments:
    (Array.isArray(user.divisionCodes)&&user.divisionCodes.length
      ? user.divisionCodes.map((code,index)=>({id:`assignment-${code}-${index+1}`,label:code==='ALL'?'Akses Global':`User ${code}`,divisionCode:code,unitName:user.unitName,subCode:index===0?user.subCode:undefined,instCode:index===0?user.instCode:undefined,poliCode:index===0?user.poliCode:undefined,subUnitCode:index===0?user.subUnitCode:undefined}))
      : [{id:`assignment-${user.divisionCode||'PEL'}-1`,label:user.divisionCode==='ALL'?'Akses Global':`User ${user.divisionCode||'PEL'}`,divisionCode:user.divisionCode||(normalizeRole(user.role)==='admin'?'ALL':'PEL'),unitName:user.unitName,subCode:user.subCode,instCode:user.instCode,poliCode:user.poliCode,subUnitCode:user.subUnitCode}]);
  return raw.map((a:any)=>({...a,hierarchyCode:a.hierarchyCode||[a.subCode,a.instCode,a.poliCode,a.subUnitCode].filter(Boolean).join('.')||undefined}));
}

export function persistClientSession(session:UserSession){
  try { sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY,JSON.stringify(session)); } catch {}
}
export function getPersistedClientSession():UserSession|null{
  try {
    const x=sessionStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if(!x)return null;
    const s=JSON.parse(x);
    return s ? {...s,role:normalizeRole(s.role)} : null;
  } catch { return null; }
}
export function clearPersistedClientSession(){try{sessionStorage.removeItem(CLIENT_SESSION_STORAGE_KEY)}catch{}}

// Authentic Firebase Cloud Function endpoint for SIDOKTER SOEGIRI
const projectId = firebaseConfig.projectId || 'sidokter-soegiri';
const DIRECT_CLOUD_AUTH_URL = `https://asia-southeast2-${projectId}.cloudfunctions.net/authApi`;

const rawAuthEnvUrl = String((import.meta as any).env?.VITE_AUTH_API_URL || '').trim();
const isClientDirect = (import.meta as any).env?.VITE_AUTH_CLIENT_DIRECT === 'true';

// Resolve the primary endpoint:
// 1. If VITE_AUTH_API_URL is an explicit remote URL (http/https), use it directly.
// 2. If VITE_AUTH_CLIENT_DIRECT is true, use the Cloud Function endpoint directly.
// 3. Otherwise, default to same-origin proxy '/api/auth' (works with Express & Firebase Hosting rewrites).
const PRIMARY_AUTH_API_URL = (rawAuthEnvUrl.startsWith('http://') || rawAuthEnvUrl.startsWith('https://'))
  ? rawAuthEnvUrl.replace(/\/$/, '')
  : isClientDirect
    ? DIRECT_CLOUD_AUTH_URL
    : (rawAuthEnvUrl || '/api/auth');

async function getIdToken(forceRefresh=false):Promise<string|null>{
  try {
    await authPersistenceReady;
    if (typeof (auth as any).authStateReady === 'function') {
      await (auth as any).authStateReady();
    }
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(forceRefresh);
      if (token) return token;
    }
    return null;
  } catch {
    return null;
  }
}

async function callAuthApi(action:string, body:Record<string,any>={}, token?:string|null){
  const bearer = token === undefined ? await getIdToken() : token;
  const s = getPersistedClientSession();
  const headers:Record<string,string>={'Content-Type':'application/json','Accept':'application/json'};
  if (bearer && typeof bearer === 'string' && bearer.includes('.')) {
    headers.Authorization=`Bearer ${bearer}`;
  }
  if (s?.sessionId) {
    headers['X-Session-Id'] = s.sessionId;
  }
  if (s?.authUid) {
    headers['X-Soegiri-Auth-Uid'] = s.authUid;
  }
  if (s?.username) {
    headers['X-User-Username'] = s.username;
  }

  const sendRequestTo = (url: string, customHeaders = headers) => fetch(url, {
    method: 'POST',
    headers: customHeaders,
    body: JSON.stringify({ action, ...body }),
    cache: 'no-store'
  });

  let targetUrl = PRIMARY_AUTH_API_URL;
  let response: Response;

  try {
    response = await sendRequestTo(targetUrl);
    // Do not retry HTTP 500 application errors. The authApi now returns a
    // stage/code diagnostic; repeating the same request only creates noise and
    // can consume login-rate budget. Network/502/503 failover remains below.
  } catch (netErr: any) {
    console.warn(`[authService] Network error calling ${targetUrl}:`, netErr);
    // Bidirectional network fallback between same-origin /api/auth and direct Cloud Function
    const fallbackUrl = targetUrl !== DIRECT_CLOUD_AUTH_URL ? DIRECT_CLOUD_AUTH_URL : '/api/auth';
    try {
      response = await sendRequestTo(fallbackUrl);
      targetUrl = fallbackUrl;
    } catch {
      const err: any = new Error('Gagal terhubung ke server autentikasi (koneksi terputus).');
      err.status = 503;
      throw err;
    }
  }

  // If primary returned 404 (e.g. Firebase Hosting rewrite unconfigured/failed) or 405 or 502/503/504,
  // automatically failover to direct Cloud Function or same-origin endpoint
  if ((response.status === 404 || response.status === 405 || response.status >= 502) && action !== 'logout') {
    const failoverUrl = targetUrl !== DIRECT_CLOUD_AUTH_URL ? DIRECT_CLOUD_AUTH_URL : '/api/auth';
    console.warn(`[authService] Auth endpoint ${targetUrl} returned HTTP ${response.status}. Automatically failing over to ${failoverUrl}...`);
    try {
      const failoverRes = await sendRequestTo(failoverUrl);
      if (failoverRes.ok || failoverRes.status < response.status) {
        response = failoverRes;
        targetUrl = failoverUrl;
      }
    } catch (failoverErr) {
      console.warn(`[authService] Failover to ${failoverUrl} error:`, failoverErr);
    }
  }

  // If response failed with 500 or 401 and an Authorization header was attached,
  // automatically retry without the Authorization header using session credentials only.
  if ((response.status >= 500 || response.status === 401) && headers.Authorization) {
    console.warn(`[authService] Request to ${action} returned ${response.status} with Bearer token; retrying with session headers only...`);
    const retryHeaders = { ...headers };
    delete retryHeaders.Authorization;
    try {
      const retryRes = await sendRequestTo(targetUrl, retryHeaders);
      if (retryRes.ok || (retryRes.status < response.status)) {
        response = retryRes;
      }
    } catch {}
  }

  let payload:any={};
  try { payload=await response.json(); } catch {}
  if(!response.ok){
    const message = payload?.message
      || payload?.error?.message
      || (typeof payload?.error === 'string' ? payload.error : '')
      || `Layanan autentikasi gagal (HTTP ${response.status}).`;
    const err:any=new Error(message);
    err.status=response.status;
    err.lockedOut=payload?.lockedOut;
    err.remainingMinutes=payload?.remainingMinutes;
    throw err;
  }
  return payload;
}

function buildSession(raw:any):UserSession{
  const role=normalizeRole(raw?.role);
  const a=normalizeAssignments(raw||{});
  return {
    id:raw?.authUid,
    authUid:raw?.authUid,
    username:String(raw?.username||'').toLowerCase(),
    name:raw?.name||raw?.username||'Pengguna',
    role,
    sessionId:String(raw?.sessionId||''),
    sessionCreatedAt:Number(raw?.sessionCreatedAt||Date.now()),
    lastActiveAt:Number(raw?.lastActiveAt||Date.now()),
    unitName:raw?.unitName,
    divisionCode:raw?.divisionCode||(role==='admin'?'ALL':'PEL'),
    divisionCodes:Array.from(new Set((Array.isArray(raw?.divisionCodes)?raw.divisionCodes:[]).filter(Boolean))),
    assignments:a,
    badges:Array.isArray(raw?.badges)?raw.badges:[],
    subCode:raw?.subCode,
    instCode:raw?.instCode,
    poliCode:raw?.poliCode,
    subUnitCode:raw?.subUnitCode
  };
}

/** Server-authoritative session validation. Browser storage is only a cache. */
export async function validatePersistedClientSession(session?:UserSession|null){
  try {
    await authPersistenceReady;
    if (typeof (auth as any).authStateReady === 'function') {
      await (auth as any).authStateReady();
    }
    const currentSession = session || getPersistedClientSession();
    if (!currentSession?.sessionId) return false;
    const payload=await callAuthApi('session', {});
    return !!payload?.success && !!payload?.session;
  } catch { return false; }
}

export async function refreshUserSessionProfile(session?:UserSession|null):Promise<UserSession|null>{
  try {
    await authPersistenceReady;
    if (typeof (auth as any).authStateReady === 'function') {
      await (auth as any).authStateReady();
    }
    const payload=await callAuthApi('session', {});
    if(!payload?.success||!payload?.session)return null;
    if (payload?.customToken && typeof payload.customToken === 'string' && !auth.currentUser) {
      try {
        await signInWithCustomToken(auth, payload.customToken);
      } catch (tokenErr) {
        console.warn('[authService] Custom token sign-in note:', tokenErr);
      }
    }
    const refreshed=buildSession(payload.session);
    persistClientSession(refreshed);
    return refreshed;
  } catch {
    return null;
  }
}

export async function getCurrentAuthToken(forceRefresh=false){
  return getIdToken(forceRefresh);
}

/** Trusted server API call for operations that must use the SIDOKTER session
 * and Firebase Admin SDK instead of relying on browser Firestore Rules. */
export async function callAuthenticatedAuthApi(action:string, body:Record<string,any>={}){
  return callAuthApi(action, body);
}

/** Login is performed only by the trusted Firebase Function. */
export async function provisionInitialAdmin(setupSecret:string,password:string){
  const secret=String(setupSecret||''); const pass=String(password||'');
  if(!secret||!pass) return {success:false,message:'Setup key dan password Admin wajib diisi.'};
  try { return await callAuthApi('bootstrap-admin',{setupSecret:secret,password:pass},null); }
  catch(err:any){ return {success:false,message:err?.message||'Provisioning Admin gagal.',status:err?.status}; }
}

export async function authenticateUser(usernameInput:string,passwordInput:string){
  const username=usernameInput.trim().toLowerCase();
  const password=passwordInput;
  if(!username||!password)return{success:false,message:'Nama pengguna dan kata sandi wajib diisi.'};

  try {
    const result=await callAuthApi('login',{username,password},null);
    if(!result?.success||!result?.customToken) return {success:false,message:result?.message||'Login gagal.'};
    await authPersistenceReady;
    try {
      if (!result.customToken || typeof result.customToken !== 'string' || !result.customToken.includes('.')) {
        throw new Error('AUTH_CUSTOM_TOKEN_INVALID');
      }
      await signInWithCustomToken(auth, result.customToken);
    } catch (tokenErr: any) {
      console.error('[authService] Firebase Auth custom token sign-in failed:', tokenErr?.code || tokenErr?.message || tokenErr);
      clearPersistedClientSession();
      return {
        success: false,
        message: 'Login gagal: token autentikasi Firebase tidak valid untuk project SIDOKTER ini.',
      };
    }
    const session=buildSession(result.session);
    persistClientSession(session);
    if (session.role === 'admin') {
      try {
        if (!sessionStorage.getItem('soegiri_sop_migrated_v2')) {
          sessionStorage.setItem('soegiri_sop_migrated_v2', 'true');
          void callAuthApi('migrate-sop-access').catch(() => {});
        }
      } catch {}
    }
    await recordAuditLog({username:session.username,name:session.name,role:session.role,event:'LOGIN_SUCCESS',sessionId:session.sessionId,details:'Login melalui trusted server authentication.'});
    return{success:true,session,message:result.message||'Login berhasil.'};
  } catch(err:any) {
    return {
      success:false,
      message:err?.message||'Nama pengguna atau kata sandi tidak valid.',
      lockedOut:!!err?.lockedOut,
      remainingMinutes:err?.remainingMinutes
    };
  }
}

// Kept only as compatibility exports. No account is created or repaired in the public browser.
export async function bootstrapDefaultUsers():Promise<void>{ return; }
export async function bootstrapDefaultAdmin():Promise<UserAccount>{ throw new Error('BOOTSTRAP_DISABLED'); }
export async function bootstrapKetuaPokjaAccounts(){ return; }

// Public emergency reset was a critical security vulnerability. Recovery must be
// performed by an authenticated Administrator through the secured account-management flow.
export async function emergencyResetAdminAccount(){
  return {success:false,message:'Pemulihan akun Admin dari halaman login dinonaktifkan demi keamanan. Gunakan prosedur pemulihan akun resmi Administrator.'};
}
export async function resetDefaultAdminPassword(){ return emergencyResetAdminAccount(); }

export function subscribeToUserSessionGuard(
  username:string,
  currentSessionId:string,
  onSessionRevoked:(reason:'SESSION_REVOKED'|'USER_DELETED')=>void,
  onProfileUpdated?:(profile:UserAccount)=>void
){
  let stopped=false;
  const check=async()=>{
    if(stopped) return;
    try {
      const payload = await callAuthApi('session');
      if (stopped) return;

      // Only revoke if the server EXPLICITLY confirms this session has been revoked
      if (payload?.revoked === true || payload?.sessionRevoked === true || payload?.code === 'SESSION_REVOKED') {
        onSessionRevoked('SESSION_REVOKED');
        return;
      }

      // If server returned updated session details, sync profile
      if (payload?.success && payload?.session) {
        const s = buildSession(payload.session);
        if (s && s.username === username.toLowerCase()) {
          onProfileUpdated?.({
            id: s.authUid || '',
            username: s.username,
            name: s.name,
            role: s.role,
            unitName: s.unitName,
            divisionCode: s.divisionCode,
            divisionCodes: s.divisionCodes,
            assignments: s.assignments,
            badges: s.badges || [],
            createdAt: ''
          });
        }
      }
    } catch (err: any) {
      // Offline, network hiccups, static hosting, or cold-start must never abort the user's active session.
      // Only explicitly revoke if server returns an unequivocal SESSION_REVOKED response code.
      if (err?.status === 401 && (err?.detail === 'SESSION_REVOKED' || err?.message === 'SESSION_REVOKED')) {
        onSessionRevoked('SESSION_REVOKED');
      }
    }
  };

  // Run periodic checks every 60 seconds (never synchronously at 0s, giving the login flow time to settle)
  const timer = window.setInterval(check, 60000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

export async function logoutUser(userSession?:UserSession|null){
  const token=await getIdToken();
  try { if(token) await callAuthApi('logout',{sessionId:userSession?.sessionId||''},token); } catch {}
  clearPersistedClientSession();
  try { await signOut(auth); } catch {}
  if(userSession){
    await recordAuditLog({username:userSession.username,name:userSession.name,role:userSession.role,event:'LOGOUT',sessionId:userSession.sessionId,details:'Pengguna keluar dari aplikasi.'});
  }
}

export async function changeUserPassword(_username:string,oldPassword:string,newPassword:string){
  if(newPassword.trim().length<8||!/[A-Z]/.test(newPassword)||!/[a-z]/.test(newPassword)||!/[0-9]/.test(newPassword)) {
    return{success:false,message:'Kata sandi baru minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, dan angka.'};
  }
  try { return await callAuthApi('change-password',{currentPassword:oldPassword,newPassword:newPassword.trim()}); }
  catch(err:any){ return{success:false,message:err?.message||'Gagal mengganti kata sandi.'}; }
}

export async function revokeAllUserSessions(_usernameOrId:string){
  try { return await callAuthApi('revoke-all'); }
  catch(err:any){ return{success:false,message:err?.message||'Gagal mencabut sesi.'}; }
}

/** Administrator-only account management. Credentials are sent only to the trusted backend. */
export async function fetchManagedUsers():Promise<UserAccount[]> {
  const payload=await callAuthApi('user-list');
  return Array.isArray(payload?.users) ? payload.users.map((u:any)=>({
    id:String(u.id||''), username:String(u.username||'').toLowerCase(), name:u.name||u.username||'',
    role:normalizeRole(u.role), unitName:u.unitName, divisionCode:u.divisionCode,
    divisionCodes:u.divisionCodes, assignments:u.assignments, badges:u.badges,
    subCode:u.subCode, instCode:u.instCode, poliCode:u.poliCode, subUnitCode:u.subUnitCode,
    createdAt:u.createdAt||'', updatedAt:u.updatedAt, credentialStatus:u.credentialStatus
  })) : [];
}

export async function saveManagedUser(user:UserAccount):Promise<{success:boolean;message:string}> {
  const password = String((user as any).password || '');
  const profile:any = { ...user };
  delete profile.password;
  delete profile.passwordHash;
  delete profile.passwordSalt;
  try {
    return await callAuthApi('user-save', { user: profile, password });
  } catch(err:any) {
    throw err;
  }
}

export async function deleteManagedUser(userId:string):Promise<{success:boolean;message:string}> {
  try { return await callAuthApi('user-delete', { userId }); }
  catch(err:any) { throw err; }
}

export async function restoreManagedUserProfile(user:UserAccount):Promise<{success:boolean;message:string}> {
  const profile:any = { ...user };
  delete profile.password;
  delete profile.passwordHash;
  delete profile.passwordSalt;
  try { return await callAuthApi('user-restore-profile', { user: profile }); }
  catch(err:any) { throw err; }
}

export async function recordAuditLog(data:Omit<LoginAuditLog,'id'|'timestamp'>&{timestamp?:string}){
  // Operational audit UI cache only. Security-critical auth events are written server-side.
  try{
    const all=JSON.parse(localStorage.getItem(AUDIT_KEY)||'[]');
    all.unshift({...data,id:`log-${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2,7)}`,timestamp:data.timestamp||new Date().toISOString()});
    localStorage.setItem(AUDIT_KEY,JSON.stringify(all.slice(0,500)));
  }catch{}
}
export async function fetchRecentAuditLogs(limitCount=50){try{return JSON.parse(localStorage.getItem(AUDIT_KEY)||'[]').slice(0,limitCount) as LoginAuditLog[]}catch{return[]}}
