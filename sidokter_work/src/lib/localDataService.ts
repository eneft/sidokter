import { DEFAULT_NUMBERING_CONFIG } from '../utils/numbering';
import { hashPassword } from './passwordCrypto';
import { INITIAL_USERS } from './accountService';

export async function initializeLocalData(): Promise<void> {
  const rawUsers = localStorage.getItem('soegiri_offline_users_v1');
  let currentUsers: any[] = [];
  try {
    currentUsers = rawUsers ? JSON.parse(rawUsers) : [];
  } catch {
    currentUsers = [];
  }

  let modified = false;

  // Ensure Admin account exists
  if (!currentUsers.some((u) => u.username?.toLowerCase() === 'admin')) {
    const { hash, salt } = await hashPassword('admin123');
    currentUsers.push({
      ...INITIAL_USERS[0],
      passwordHash: hash,
      passwordSalt: salt,
      failedLoginAttempts: 0,
      lockoutUntil: 0
    });
    modified = true;
  }

  // Ensure Petugas Pelayanan account exists
  if (!currentUsers.some((u) => u.username?.toLowerCase() === 'pelayanan')) {
    const { hash, salt } = await hashPassword('pelayanan123');
    currentUsers.push({
      ...INITIAL_USERS[1],
      passwordHash: hash,
      passwordSalt: salt,
      failedLoginAttempts: 0,
      lockoutUntil: 0
    });
    modified = true;
  }

  if (modified || !rawUsers) {
    localStorage.setItem('soegiri_offline_users_v1', JSON.stringify(currentUsers));
  }

  if (!localStorage.getItem('soegiri_offline_numbering_v1')) {
    localStorage.setItem('soegiri_offline_numbering_v1', JSON.stringify(DEFAULT_NUMBERING_CONFIG));
  }
  if (!localStorage.getItem('soegiri_offline_maintenance_v1')) {
    localStorage.setItem('soegiri_offline_maintenance_v1', JSON.stringify({ enabled: false, message: 'Sistem sedang dalam pemeliharaan. Silakan coba kembali beberapa saat lagi.' }));
  }
}
