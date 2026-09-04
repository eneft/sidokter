# SIDOKTER — Migrasi Local Auth → Firebase

Patch ini menyelesaikan jalur login Local → Firebase yang sebelumnya terputus.

## Yang diubah
- Firebase Hosting `/api/auth` di-rewrite ke Function `authApi` region `asia-southeast2`.
- `/api/pdf` di-rewrite ke Function `pdfApi` region `asia-southeast2`.
- Login Firebase tidak lagi fallback ke anonymous authentication.
- Login baru mencabut seluruh session lama sebelum membuat session baru (single active session per akun).
- Firestore Rules tidak lagi membuka `users`, `sops`, `library_documents`, dan konfigurasi dengan `if true`.
- Credential dan session tetap server-only.
- Script migrasi satu kali untuk akun Local `admin-root` disediakan di `scripts/migrate-local-admin.cjs`.

## Deploy
1. Install dependency root dan Functions.
2. Build frontend: `npm run build`
3. Deploy: `firebase deploy --only functions,hosting,firestore`
4. Migrasikan akun Local lama ke Firestore menggunakan script migrasi.

## Migrasi akun Admin
Jalankan setelah Functions dependency terpasang dan Google Application Default Credentials/service account tersedia:

`node scripts/migrate-local-admin.cjs`

Script akan membuat/memperbarui:
- `users/admin-root`
- `user_credentials/admin-root`

Hash + salt PBKDF2 dari `data/auth_db.json` dipertahankan. Password plaintext tidak diperlukan dan session Local tidak ikut dipindahkan.

## Catatan penting
`server.ts` dan `server/authHandler.ts` sengaja tidak dihapus pada patch ini agar mode Local tetap tersedia sebagai fallback/development sampai deployment Firebase dinyatakan lulus uji.

Firebase Hosting saat ini menangani `/api/auth` dan `/api/pdf`. Endpoint `/api/storage/*` masih merupakan endpoint server Express lama dan belum dipindahkan ke Firebase Function dalam patch autentikasi ini.
