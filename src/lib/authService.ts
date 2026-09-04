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

const AUTH_API_URL = String(
  (import.meta as any).env?.VITE_AUTH_API_URL || '/api/auth'
).replace(/\/$/,'');

async function getIdToken(forceRefresh=false):Promise<string|null>{
  try {
    await authPersistenceReady;
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(forceRefresh);
      if (token) return token;
    }
    const s = getPersistedClientSession();
    return s?.sessionId || null;
  } catch {
    const s = getPersistedClientSession();
    return s?.sessionId || null;
  }
}

async function callAuthApi(action:string, body:Record<string,any>={}, token?:string|null){
  const bearer = token === undefined ? await getIdToken() : token;
  const headers:Record<string,string>={'Content-Type':'application/json','Accept':'application/json'};
  if (bearer) {
    headers.Authorization=`Bearer ${bearer}`;
    headers['X-Session-Id'] = bearer;
  }
  let response: Response;
  try {
    response = await fetch(AUTH_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...body }),
      cache: 'no-store'
    });
  } catch (netErr: any) {
    console.warn(`[authService] Network error calling ${AUTH_API_URL}:`, netErr);
    if (AUTH_API_URL !== '/api/auth') {
      try {
        response = await fetch('/api/auth', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, ...body }),
          cache: 'no-store'
        });
      } catch {
        const err: any = new Error('Gagal terhubung ke server autentikasi (koneksi terputus).');
        err.status = 503;
        throw err;
      }
    } else {
      const err: any = new Error('Gagal terhubung ke server autentikasi (koneksi terputus).');
      err.status = 503;
      throw err;
    }
  }

  let payload:any={};
  try { payload=await response.json(); } catch {}
  if(!response.ok){
    const err:any=new Error(payload?.message||`Layanan autentikasi gagal (HTTP ${response.status}).`);
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
export async function validatePersistedClientSession(_session:UserSession){
  try {
    await authPersistenceReady;
    if(!auth.currentUser)return false;
    const payload=await callAuthApi('session');
    return !!payload?.success && !!payload?.session;
  } catch { return false; }
}

export async function refreshUserSessionProfile(_session:UserSession):Promise<UserSession|null>{
  try {
    const payload=await callAuthApi('session');
    if(!payload?.success||!payload?.session)return null;
    const session=buildSession(payload.session);
    persistClientSession(session);
    return session;
  } catch {
    return null;
  }
}

export async function getCurrentAuthToken(forceRefresh=false){
  return getIdToken(forceRefresh);
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
      if (!result.customToken || typeof result.customToken !== 'string') {
        throw new Error('AUTH_CUSTOM_TOKEN_MISSING');
      }
      await signInWithCustomToken(auth, result.customToken);
    } catch (tokenErr) {
      try { await signOut(auth); } catch {}
      const err:any = new Error('Autentikasi Firebase gagal menyelesaikan sesi. Silakan coba lagi.');
      err.status = 502;
      err.cause = tokenErr;
      throw err;
    }
    const session=buildSession(result.session);
    persistClientSession(session);
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
  onSessionRevoked:(reason:'REVOKED_ANOTHER_LOGIN'|'USER_DELETED')=>void,
  onProfileUpdated?:(profile:UserAccount)=>void
){
  let stopped=false;
  const check=async()=>{
    if(stopped)return;
    try{
      const payload=await callAuthApi('session');
      if(!payload?.success||!payload?.session){
        onSessionRevoked('REVOKED_ANOTHER_LOGIN');
        return;
      }
      const s=buildSession(payload.session);
      if(s.username!==username.toLowerCase() || s.sessionId!==currentSessionId){
        onSessionRevoked('REVOKED_ANOTHER_LOGIN');
        return;
      }
      onProfileUpdated?.({
        id:s.authUid||'',username:s.username,name:s.name,role:s.role,unitName:s.unitName,
        divisionCode:s.divisionCode,divisionCodes:s.divisionCodes,assignments:s.assignments,badges:s.badges||[],createdAt:''
      });
    }catch(err:any){
      if(err?.status===401) onSessionRevoked('REVOKED_ANOTHER_LOGIN');
    }
  };
  void check();
  const timer=window.setInterval(check,10000);
  return()=>{stopped=true;window.clearInterval(timer);};
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
