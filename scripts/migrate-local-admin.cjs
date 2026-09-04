/* One-time migration: copy the existing Local SIDOKTER admin profile + PBKDF2 credential to Firestore.
 * Run from the project root after installing functions dependencies and authenticating with Google ADC.
 * Example: GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json node scripts/migrate-local-admin.cjs
 */
const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');

const sourcePath = path.resolve(__dirname, '..', 'data', 'auth_db.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const user = source.users?.['admin-root'];
const credential = source.credentials?.['admin-root'];

if (!user || !credential?.passwordHash || !credential?.passwordSalt) {
  throw new Error('Akun admin-root atau credential PBKDF2 tidak ditemukan di data/auth_db.json');
}

admin.initializeApp();
const db = admin.firestore();

(async () => {
  const ref = db.collection('users').doc('admin-root');
  const existing = await ref.get();
  if (existing.exists && String(existing.data()?.role || '').toLowerCase() !== 'admin') {
    throw new Error('Firestore users/admin-root sudah ada tetapi bukan role admin. Migrasi dihentikan.');
  }

  const now = new Date().toISOString();
  const profile = {
    id: 'admin-root',
    username: String(user.username).trim().toLowerCase(),
    name: user.name || 'Administrator SIDOKTER',
    role: 'admin',
    divisionCode: 'ALL',
    divisionCodes: ['ALL'],
    assignments: [],
    badges: [],
    unitName: user.unitName || 'RSUD Dr. Soegiri Lamongan',
    createdAt: user.createdAt || now,
    updatedAt: now,
    credentialStatus: 'ACTIVE',
    failedLoginAttempts: 0,
    lockoutUntil: 0
  };

  await ref.set(profile, { merge: true });
  await db.collection('user_credentials').doc('admin-root').set({
    passwordHash: credential.passwordHash,
    passwordSalt: credential.passwordSalt,
    updatedAt: now
  }, { merge: true });

  // Existing Local sessions are intentionally not migrated.
  console.log('Migrasi Admin selesai: users/admin-root + user_credentials/admin-root');
  console.log('Session Local TIDAK dimigrasikan; login berikutnya akan membuat session Firebase baru.');
  process.exit(0);
})().catch((err) => {
  console.error('Migrasi gagal:', err.message || err);
  process.exit(1);
});
