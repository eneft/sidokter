/**
 * ACCOUNT PROFILE SERVICE
 *
 * Browser cache contains profile data only. Passwords, password hashes/salts,
 * lock state and active sessions are backend-only security data.
 */
import { UserAccount } from '../types';
import { saveManagedUser, deleteManagedUser, restoreManagedUserProfile, fetchManagedUsers } from './authService';
import { fetchUsersFromFirestore, subscribeToFirestoreUsers, saveUserToFirestore, deleteUserFromFirestore } from './firestoreService';

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
    const backendUsers = await fetchManagedUsers().catch(() => []);
    const firestoreUsers = await fetchUsersFromFirestore().catch(() => []);
    
    const map = new Map<string, UserAccount>();
    firestoreUsers.forEach(u => {
      if (u && u.username) map.set(u.id || u.username, u);
    });
    backendUsers.forEach(u => {
      if (u && u.username) {
        const existing = map.get(u.id || u.username);
        map.set(u.id || u.username, { ...existing, ...u });
      }
    });

    const merged = Array.from(map.values());
    if (merged.length > 0) {
      writeCache(merged);
      return merged;
    }
    return readCache();
  } catch(e) {
    console.warn('syncUsersWithFirestore error:',e);
    return readCache();
  }
}

export function subscribeToUsers(onData:(users:UserAccount[])=>void,onError?:(err:any)=>void) {
  let stopped=false;
  const emit=()=>{ if(!stopped) onData(readCache().filter(u=>u.username!=='guest').sort((a,b)=>a.username.localeCompare(b.username))); };
  emit();
  subscribers.add(emit);

  // Realtime Firestore subscription
  const unsubscribeFirestore = subscribeToFirestoreUsers((firestoreUsers) => {
    if (stopped) return;
    if (firestoreUsers && firestoreUsers.length > 0) {
      const current = readCache();
      const map = new Map<string, UserAccount>();
      firestoreUsers.forEach(u => map.set(u.id || u.username, u));
      current.forEach(u => {
        if (!map.has(u.id || u.username)) map.set(u.id || u.username, u);
      });
      writeCache(Array.from(map.values()));
    }
  });

  const refresh=async()=>{
    try {
      const users=await fetchManagedUsers();
      if(!stopped && users && users.length > 0) {
        const current = readCache();
        const map = new Map<string, UserAccount>();
        current.forEach(u => map.set(u.id || u.username, u));
        users.forEach(u => map.set(u.id || u.username, { ...map.get(u.id || u.username), ...u }));
        writeCache(Array.from(map.values()));
      }
    } catch(err) { if(!stopped) onError?.(err); }
  };
  void refresh();
  const timer=window.setInterval(refresh,15000);
  return ()=>{ 
    stopped=true; 
    subscribers.delete(emit); 
    unsubscribeFirestore();
    window.clearInterval(timer); 
  };
}

/**
 * Save via trusted auth backend and synchronize with Firestore.
 */
export async function saveUserToLocal(user:UserAccount):Promise<void> {
  const result=await saveManagedUser(user);
  if(!result?.success) throw new Error(result?.message || 'Gagal menyimpan akun.');
  await saveUserToFirestore(user);
  await syncUsersWithFirestore();
}

export async function deleteUserFromLocal(userId:string):Promise<void> {
  const result=await deleteManagedUser(userId);
  if(!result?.success) throw new Error(result?.message || 'Gagal menghapus akun.');
  await deleteUserFromFirestore(userId);
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
