/**
 * ACCOUNT SERVICE
 * Service khusus akun pengguna dan data kredensial lokal.
 */
import { UserAccount } from '../types';
import { hashPassword } from './passwordCrypto';

const USERS_KEY = 'soegiri_offline_users_v1';
const subscribers = new Set<() => void>();

function readUsers(): UserAccount[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) as UserAccount[] : [];
  } catch {
    return [];
  }
}

function writeUsers(users: UserAccount[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  subscribers.forEach((fn) => fn());
}

export const INITIAL_USERS: UserAccount[] = [{
  id: 'usr-admin-default',
  username: 'admin',
  name: 'Administrator Tata Naskah',
  role: 'admin',
  unitName: 'Tim Manajemen & Sekretariat',
  divisionCode: 'ALL',
  createdAt: new Date().toISOString()
}];

export function subscribeToUsers(onData: (users: UserAccount[]) => void, onError?: (err: any) => void) {
  const emit = () => {
    try {
      const users = readUsers()
        .filter((u) => u.username !== 'guest')
        .sort((a, b) => a.username.localeCompare(b.username))
        .map(({ passwordHash, passwordSalt, password, ...u }) => u as UserAccount);
      onData(users);
    } catch (e) {
      onError?.(e);
    }
  };
  emit();
  subscribers.add(emit);
  const onStorage = (e: StorageEvent) => { if (e.key === USERS_KEY) emit(); };
  window.addEventListener('storage', onStorage);
  return () => { subscribers.delete(emit); window.removeEventListener('storage', onStorage); };
}

export async function saveUserToLocal(user: UserAccount): Promise<void> {
  const all = readUsers();
  const existing = all.find((u) => u.id === user.id);
  const { password, ...profile } = user as UserAccount & { password?: string };
  const payload: UserAccount = { ...(existing || {} as UserAccount), ...profile, updatedAt: new Date().toISOString() };
  if (password?.trim()) {
    const h = await hashPassword(password.trim());
    payload.passwordHash = h.hash;
    payload.passwordSalt = h.salt;
    delete (payload as any).password;
  }
  const index = all.findIndex((u) => u.id === user.id);
  if (index >= 0) all[index] = payload; else all.push(payload);
  writeUsers(all);
}

export async function deleteUserFromLocal(userId: string): Promise<void> {
  writeUsers(readUsers().filter((u) => u.id !== userId));
}

/** Full account records for system backup. Active session and temporary lock state are excluded. */
export function getAllUsersForBackup(): UserAccount[] {
  return readUsers().filter((u) => u.username !== 'guest').map((u) => {
    const { activeSessionId, sessionCreatedAt, failedLoginAttempts, lockoutUntil, password, ...safe } = u as UserAccount & { password?: string };
    return safe;
  });
}

/** Restore account profiles and password hashes without restoring active sessions. */
export async function restoreUsersFromBackup(users: UserAccount[], preserveUsername?: string): Promise<void> {
  const current = readUsers();
  const currentByUsername = new Map(current.map((u) => [u.username.toLowerCase(), u]));
  const restored = users.filter((u) => u && u.username && u.username !== 'guest').map((u) => {
    const existing = currentByUsername.get(u.username.toLowerCase());
    return {
      ...u,
      activeSessionId: existing?.activeSessionId,
      sessionCreatedAt: existing?.sessionCreatedAt,
      failedLoginAttempts: 0,
      lockoutUntil: 0,
      ...(preserveUsername && u.username.toLowerCase() === preserveUsername.toLowerCase() ? { lastLoginAt: existing?.lastLoginAt } : {})
    };
  });
  writeUsers(restored);
}
