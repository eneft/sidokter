import { UserAccount, UserSession, UserAssignment, LoginAuditLog } from '../types';
import { hashPassword, verifyPassword } from './passwordCrypto';

const USERS_KEY='soegiri_offline_users_v1';
const AUDIT_KEY='soegiri_offline_audit_v1';
const CLIENT_SESSION_STORAGE_KEY='soegiri_sop_client_session_v2';
export const MAX_FAILED_ATTEMPTS=5;
export const LOCKOUT_DURATION_MS=15*60*1000;
export const IDLE_TIMEOUT_MS=30*60*1000;
export const ABSOLUTE_TIMEOUT_MS=12*60*60*1000;

function users():UserAccount[]{try{return JSON.parse(localStorage.getItem(USERS_KEY)||'[]')}catch{return[]}}
function saveUsers(value:UserAccount[]){localStorage.setItem(USERS_KEY,JSON.stringify(value)); window.dispatchEvent(new StorageEvent('storage',{key:USERS_KEY}));}
function normalizeAssignments(user:UserAccount):UserAssignment[]{
 const raw=(Array.isArray(user.assignments)&&user.assignments.length)?user.assignments:(Array.isArray(user.divisionCodes)&&user.divisionCodes.length?user.divisionCodes.map((code,index)=>({id:`assignment-${code}-${index+1}`,label:code==='ALL'?'Akses Global':`Petugas ${code}`,divisionCode:code,unitName:user.unitName,subCode:index===0?user.subCode:undefined,instCode:index===0?user.instCode:undefined,poliCode:index===0?user.poliCode:undefined,subUnitCode:index===0?user.subUnitCode:undefined})):[{id:`assignment-${user.divisionCode||'PEL'}-1`,label:user.divisionCode==='ALL'?'Akses Global':`Petugas ${user.divisionCode||'PEL'}`,divisionCode:user.divisionCode||(user.role==='admin'?'ALL':'PEL'),unitName:user.unitName,subCode:user.subCode,instCode:user.instCode,poliCode:user.poliCode,subUnitCode:user.subUnitCode}]);
 return raw.map(a=>({...a,hierarchyCode:a.hierarchyCode||[a.subCode,a.instCode,a.poliCode,a.subUnitCode].filter(Boolean).join('.')||undefined}));
}
export function persistClientSession(session:UserSession){try{sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY,JSON.stringify(session));}catch{}}
export function getPersistedClientSession():UserSession|null{try{const x=sessionStorage.getItem(CLIENT_SESSION_STORAGE_KEY);return x?JSON.parse(x):null}catch{return null}}
export function clearPersistedClientSession(){try{sessionStorage.removeItem(CLIENT_SESSION_STORAGE_KEY)}catch{}}
export async function validatePersistedClientSession(session:UserSession){const u=users().find(x=>x.id===session.authUid||x.username===session.username);return !!u && (!u.activeSessionId||u.activeSessionId===session.sessionId)}
export async function refreshUserSessionProfile(session:UserSession):Promise<UserSession|null>{const u=users().find(x=>x.id===session.authUid||x.username===session.username);if(!u)return null; if(u.activeSessionId&&u.activeSessionId!==session.sessionId)return null;const a=normalizeAssignments(u);const p=a[0];const s={...session,name:u.name||session.name,role:u.role||session.role,unitName:u.unitName||p?.unitName||session.unitName,divisionCode:u.divisionCode||p?.divisionCode||session.divisionCode,divisionCodes:Array.from(new Set(a.map(x=>x.divisionCode).filter(Boolean))),assignments:a,subCode:u.subCode||p?.subCode,instCode:u.instCode||p?.instCode,poliCode:u.poliCode||p?.poliCode,subUnitCode:u.subUnitCode||p?.subUnitCode};persistClientSession(s);return s;}
export async function recordAuditLog(data:Omit<LoginAuditLog,'id'|'timestamp'>&{timestamp?:string}){try{const all=JSON.parse(localStorage.getItem(AUDIT_KEY)||'[]');all.unshift({...data,id:`log-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,timestamp:data.timestamp||new Date().toISOString()});localStorage.setItem(AUDIT_KEY,JSON.stringify(all.slice(0,500)));}catch{}}
export async function bootstrapDefaultUsers():Promise<void>{
  let all=users();
  let changed=false;
  if(!all.some(x=>x.username.toLowerCase()==='admin')){
    const {hash,salt}=await hashPassword('admin123');
    all.push({
      id:'usr-admin-default',
      username:'admin',
      name:'Administrator Tata Naskah',
      role:'admin',
      unitName:'Tim Manajemen & Sekretariat SPO',
      divisionCode:'ALL',
      divisionCodes:['ALL'],
      assignments:[{id:'assignment-ALL-1',label:'Akses Global Administrator',divisionCode:'ALL',unitName:'Tim Manajemen & Sekretariat SPO'}],
      createdAt:new Date().toISOString(),
      passwordHash:hash,
      passwordSalt:salt,
      failedLoginAttempts:0,
      lockoutUntil:0
    });
    changed=true;
  }
  if(!all.some(x=>x.username.toLowerCase()==='pelayanan')){
    const {hash,salt}=await hashPassword('pelayanan123');
    all.push({
      id:'usr-petugas-pelayanan',
      username:'pelayanan',
      name:'Petugas Bidang Pelayanan',
      role:'petugas',
      unitName:'Bidang Pelayanan',
      divisionCode:'PEL',
      divisionCodes:['PEL'],
      assignments:[{id:'assignment-PEL-1',label:'Petugas Pelayanan',divisionCode:'PEL',unitName:'Bidang Pelayanan'}],
      createdAt:new Date().toISOString(),
      passwordHash:hash,
      passwordSalt:salt,
      failedLoginAttempts:0,
      lockoutUntil:0
    });
    changed=true;
  }
  if(changed){
    saveUsers(all);
  }
}
export async function bootstrapDefaultAdmin():Promise<UserAccount>{await bootstrapDefaultUsers();return users().find(x=>x.username==='admin')!;}
export async function bootstrapKetuaPokjaAccounts(){return;}
export async function resetDefaultAdminPassword(){const {hash,salt}=await hashPassword('admin123');let all=users();const i=all.findIndex(x=>x.username==='admin');if(i<0)return{success:false,message:'Akun Admin tidak ditemukan.'};all[i]={...all[i],passwordHash:hash,passwordSalt:salt,password:undefined,failedLoginAttempts:0,lockoutUntil:0,activeSessionId:undefined};saveUsers(all);return{success:true,message:'Akun Admin berhasil di-reset ke username "admin" dan password "admin123".'};}
export async function authenticateUser(usernameInput:string,passwordInput:string){
  const username=usernameInput.trim().toLowerCase(),password=passwordInput.trim();
  if(!username||!password)return{success:false,message:'Nama pengguna dan kata sandi wajib diisi.'};
  let all=users();
  let u=all.find(x=>x.username.toLowerCase()===username);
  if(!u&&(username==='admin'||username==='pelayanan')){
    await bootstrapDefaultUsers();
    all=users();
    u=all.find(x=>x.username.toLowerCase()===username);
  }
  if(!u)return{success:false,message:'Nama pengguna atau kata sandi tidak valid.'};const now=Date.now();if((u.lockoutUntil||0)>now){const m=Math.ceil(((u.lockoutUntil||0)-now)/60000);return{success:false,message:`Akun terkunci sementara. Coba lagi dalam sekitar ${m} menit.`,lockedOut:true,remainingMinutes:m};}let valid=false;if(u.passwordHash&&u.passwordSalt)valid=await verifyPassword(password,u.passwordHash,u.passwordSalt);else if((u as any).password)valid=(u as any).password===password;if(!valid){const attempts=(u.failedLoginAttempts||0)+1;const locked=attempts>=MAX_FAILED_ATTEMPTS;const i=all.findIndex(x=>x.id===u.id);all[i]={...u,failedLoginAttempts:locked?0:attempts,lockoutUntil:locked?now+LOCKOUT_DURATION_MS:0};saveUsers(all);return{success:false,message:locked?'Akun Anda dikunci sementara selama 15 menit karena terlalu banyak percobaan login gagal.':`Kata sandi salah. Sisa kesempatan: ${MAX_FAILED_ATTEMPTS-attempts} kali.`,lockedOut:locked,remainingMinutes:locked?15:undefined};}const sessionId=crypto.randomUUID();const sessionCreatedAt=now;const i=all.findIndex(x=>x.id===u.id);all[i]={...u,activeSessionId:sessionId,sessionCreatedAt,lastLoginAt:new Date().toISOString(),failedLoginAttempts:0,lockoutUntil:0};saveUsers(all);const a=normalizeAssignments(all[i]);const session:UserSession={id:u.id,authUid:u.id,username:u.username,name:u.name,role:u.role,sessionId,sessionCreatedAt,lastActiveAt:now,unitName:u.unitName||'Unit Kerja RSUD Dr. Soegiri',divisionCode:u.divisionCode||(u.role==='admin'?'ALL':'PEL'),divisionCodes:Array.from(new Set(a.map(x=>x.divisionCode))),assignments:a,subCode:u.subCode,instCode:u.instCode,poliCode:u.poliCode,subUnitCode:u.subUnitCode};persistClientSession(session);await recordAuditLog({username:u.username,name:u.name,role:u.role,event:'LOGIN_SUCCESS',sessionId,details:'Login offline berhasil.'});return{success:true,session,message:'Login berhasil.'};}
export function subscribeToUserSessionGuard(username:string,currentSessionId:string,onSessionRevoked:(reason:'REVOKED_ANOTHER_LOGIN'|'USER_DELETED')=>void,onProfileUpdated?:(profile:UserAccount)=>void){const check=()=>{const u=users().find(x=>x.username.toLowerCase()===username.toLowerCase());if(!u){onSessionRevoked('USER_DELETED');return;}if(u.activeSessionId&&u.activeSessionId!==currentSessionId){onSessionRevoked('REVOKED_ANOTHER_LOGIN');return;}onProfileUpdated?.(u);};check();window.addEventListener('storage',check);const timer=window.setInterval(check,5000);return()=>{window.removeEventListener('storage',check);window.clearInterval(timer);};}
export async function logoutUser(userSession?:UserSession|null){clearPersistedClientSession();if(!userSession)return;const all=users();const i=all.findIndex(x=>x.id===userSession.authUid||x.username===userSession.username);if(i>=0){all[i]={...all[i],activeSessionId:undefined,sessionCreatedAt:undefined};saveUsers(all);}await recordAuditLog({username:userSession.username,name:userSession.name,role:userSession.role,sessionId:userSession.sessionId,event:'LOGOUT',details:'Pengguna keluar dari aplikasi.'});}
export async function changeUserPassword(username:string,oldPassword:string,newPassword:string){if(newPassword.trim().length<8||!/[A-Z]/.test(newPassword)||!/[a-z]/.test(newPassword)||!/[0-9]/.test(newPassword))return{success:false,message:'Kata sandi baru minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, dan angka.'};const all=users();const i=all.findIndex(x=>x.username.toLowerCase()===username.trim().toLowerCase());if(i<0)return{success:false,message:'Akun tidak ditemukan.'};const u=all[i];let valid=u.passwordHash&&u.passwordSalt?await verifyPassword(oldPassword,u.passwordHash,u.passwordSalt):(u as any).password===oldPassword;if(!valid)return{success:false,message:'Kata sandi saat ini tidak sesuai.'};const {hash,salt}=await hashPassword(newPassword.trim());all[i]={...u,passwordHash:hash,passwordSalt:salt,password:undefined,activeSessionId:undefined,updatedAt:new Date().toISOString()};saveUsers(all);return{success:true,message:'Kata sandi berhasil diperbarui.'};}
export async function revokeAllUserSessions(usernameOrId:string){const all=users();const i=all.findIndex(x=>x.id===usernameOrId||x.username.toLowerCase()===usernameOrId.toLowerCase());if(i<0)return{success:false,message:'Akun tidak ditemukan.'};all[i]={...all[i],activeSessionId:undefined,sessionCreatedAt:undefined};saveUsers(all);return{success:true,message:'Seluruh sesi aktif akun telah berhasil dicabut.'};}
export async function fetchRecentAuditLogs(limitCount=50){try{return JSON.parse(localStorage.getItem(AUDIT_KEY)||'[]').slice(0,limitCount) as LoginAuditLog[]}catch{return[]}}
