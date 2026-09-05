/**
 * ACCOUNT PROFILE SERVICE
 *
 * Browser cache contains profile data only. Passwords, password hashes/salts,
 * lock state and active sessions are backend-only security data.
 */
import { UserAccount } from '../types';
import { saveManagedUser, deleteManagedUser, restoreManagedUserProfile, fetchManagedUsers } from './authService';
import { fetchUsersFromFirestore } from './firestoreService';

const USERS_PROFILE_CACHE_KEY = 'soegiri_user_profiles_cache_v2';
const subscribers = new Set<() => void>();

function sanitizeProfile(data:any, id?:string):UserAccount|null {
  if (!data || !(data.id || id) || !data.username) return null;
  return {
    id: data.id || id!,
    username: String(data.username).trim().toLowerCase(),
    name: data.name || data.username,
    role: String(data.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
    unitName: data.unitName,
    divisionCode: data.divisionCode,
    divisionCodes: data.divisionCodes || (data.divisionCode ? [data.divisionCode] : undefined),
    assignments: data.assignments,
    badges: data.badges,
    subCode: data.subCode,
    instCode: data.instCode,
    poliCode: data.poliCode,
    subUnitCode: data.subUnitCode,
    createdAt: data.createdAt || '',
    updatedAt: data.updatedAt,
    credentialStatus: data.credentialStatus
  } as UserAccount;
}

function readCache():UserAccount[] {
  try {
    const raw = localStorage.getItem(USERS_PROFILE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((u:any)=>sanitizeProfile(u)).filter(Boolean) as UserAccount[] : [];
  } catch { return []; }
}

function writeCache(users:UserAccount[]) {
  try { localStorage.setItem(USERS_PROFILE_CACHE_KEY, JSON.stringify(users.map(u => sanitizeProfile(u)).filter(Boolean))); } catch {}
  subscribers.forEach(fn=>fn());
}

export function readUsers():UserAccount[] { return readCache(); }
export function writeUsers(users:UserAccount[]):void { writeCache(users); }

export const INITIAL_USERS: UserAccount[] = [];

export async function syncUsersWithFirestore():Promise<UserAccount[]> {
  try {
    const firestoreUsers = await fetchUsersFromFirestore();
    if (Array.isArray(firestoreUsers) && firestoreUsers.length > 0) {
      writeCache(firestoreUsers);
      return firestoreUsers;
    }
  } catch (err) {
    console.warn('[accountService] Direct Firestore users read notice:', err);
  }

  try {
    const users=await fetchManagedUsers();
    if (Array.isArray(users) && users.length > 0) {
      writeCache(users);
      return users;
    }
    return readCache();
  } catch(e) {
    console.warn('syncUsersWithFirestore error:',e);
    return readCache();
  }
}

export function subscribeToUsers(onData:(users:UserAccount[])=>void,onError?:(err:any)=>void) {
  let stopped=false;
  let isRefreshing=false;
  const emit=()=>{ if(!stopped) onData(readCache().filter(u=>u.username!=='guest').sort((a,b)=>a.username.localeCompare(b.username))); };
  emit();
  subscribers.add(emit);
  const refresh=async()=>{
    if (stopped || isRefreshing) return;
    isRefreshing = true;
    try {
      const firestoreUsers = await fetchUsersFromFirestore();
      if(!stopped && Array.isArray(firestoreUsers) && firestoreUsers.length > 0) {
        writeCache(firestoreUsers);
        return;
      }
    } catch {
      try {
        const users=await fetchManagedUsers();
        if(!stopped && Array.isArray(users) && users.length > 0) {
          writeCache(users);
          return;
        }
      } catch(err) {
        const cached = readCache();
        if (cached && cached.length > 0) {
          return;
        }
        if(!stopped) onError?.(err);
      }
    } finally {
      isRefreshing = false;
    }
  };
  void refresh();
  const timer=window.setInterval(refresh,60000);
  return ()=>{ stopped=true; subscribers.delete(emit); window.clearInterval(timer); };
}

/**
 * Save via trusted auth backend. No credential material is persisted in browser
 * storage or users/ Firestore profile documents.
 */
export async function saveUserToLocal(user:UserAccount):Promise<void> {
  const result=await saveManagedUser(user);
  if(!result?.success) throw new Error(result?.message || 'Gagal menyimpan akun.');
  await syncUsersWithFirestore();
}

export async function deleteUserFromLocal(userId:string):Promise<void> {
  const result=await deleteManagedUser(userId);
  if(!result?.success) throw new Error(result?.message || 'Gagal menghapus akun.');
  await syncUsersWithFirestore();
}

/** Backup contains profiles only. Credential hashes/salts are intentionally excluded. */
export function getAllUsersForBackup():UserAccount[] {
  return readUsers().filter(u=>u.username!=='guest').map(u=>sanitizeProfile(u)!).filter(Boolean);
}

/** Restore profile only. Passwords must be explicitly re-established by an Administrator. */
export async function restoreUsersFromBackup(users:UserAccount[], preserveUsername?:string):Promise<void> {
  const valid=users.filter(u=>u && u.username && u.username!=='guest').map(u=>sanitizeProfile(u)!).filter(Boolean);
  for(const user of valid) {
    await restoreManagedUserProfile(user);
  }
  await syncUsersWithFirestore();
}
