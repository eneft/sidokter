import { DEFAULT_NUMBERING_CONFIG } from '../utils/numbering';
import { hashPassword } from './passwordCrypto';
import { INITIAL_USERS } from './accountService';

export async function initializeLocalData(): Promise<void> {
  if (!localStorage.getItem('soegiri_offline_users_v1')) {
    const { hash, salt } = await hashPassword('admin123');
    localStorage.setItem('soegiri_offline_users_v1', JSON.stringify([{ ...INITIAL_USERS[0], passwordHash: hash, passwordSalt: salt, failedLoginAttempts: 0, lockoutUntil: 0 }]));
  }
  if (!localStorage.getItem('soegiri_offline_numbering_v1')) localStorage.setItem('soegiri_offline_numbering_v1', JSON.stringify(DEFAULT_NUMBERING_CONFIG));
  if (!localStorage.getItem('soegiri_offline_maintenance_v1')) localStorage.setItem('soegiri_offline_maintenance_v1', JSON.stringify({ enabled: false, message: 'Sistem sedang dalam pemeliharaan. Silakan coba kembali beberapa saat lagi.' }));
}
