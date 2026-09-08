const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Run from the project root after `firebase login` and with
// GOOGLE_APPLICATION_CREDENTIALS set to a service-account JSON, OR from a
// Google-authenticated environment that provides Application Default Credentials.
initializeApp();
// SIDOKTER uses a named Firestore Enterprise database; do not fall back to (default).
const FIRESTORE_DATABASE_ID = 'ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3';
const db = getFirestore(FIRESTORE_DATABASE_ID);

(async () => {
  const file = path.join(__dirname, '..', 'data', 'auth_db.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const user = data.users?.['admin-root'];
  const credential = data.credentials?.['admin-root'];
  if (!user || !credential) throw new Error('Data admin-root tidak lengkap di data/auth_db.json');

  const userRef = db.collection('users').doc('admin-root');
  const credRef = db.collection('user_credentials').doc('admin-root');
  const existing = await userRef.get();
  if (existing.exists && String(existing.data()?.role || '').toLowerCase() !== 'admin') {
    throw new Error('Dokumen users/admin-root sudah ada tetapi bukan role admin. Migrasi dibatalkan.');
  }

  const profile = { ...user, id: 'admin-root', username: 'admin', role: 'admin', updatedAt: new Date().toISOString() };
  delete profile.password;
  delete profile.passwordHash;
  delete profile.passwordSalt;

  await userRef.set(profile, { merge: true });
  await credRef.set({
    passwordHash: String(credential.passwordHash),
    passwordSalt: String(credential.passwordSalt),
    failedLoginAttempts: 0,
    lockoutUntil: 0,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  console.log('Migrasi berhasil: users/admin-root + user_credentials/admin-root');
  console.log('Password lama tetap digunakan; plaintext password tidak disimpan.');
  process.exit(0);
})().catch(err => { console.error('Migrasi gagal:', err.message); process.exit(1); });
