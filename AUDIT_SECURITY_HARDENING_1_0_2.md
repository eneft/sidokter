# SIDOKTER 1.0.2 — Security Hardening

## Tujuan
Menghilangkan credential/secret plaintext legacy dari source tanpa mengubah Firebase, Vercel, GitHub, Google AI Studio, atau alur login production.

## Perubahan
- Menghapus `test-login.json` yang berisi credential plaintext.
- Menghapus fallback bootstrap secret `soegiri-admin-secret-2025` dari `server/authHandler.ts`.
- `SIDOKTER_BOOTSTRAP_SECRET` sekarang wajib dikonfigurasi untuk bootstrap Admin pada jalur local/server fallback.
- Local auth fallback sekarang OFF secara default (`SIDOKTER_LOCAL_AUTH_FALLBACK=false`).
- Fresh local auth DB tidak lagi melakukan pre-seed Admin dengan password yang diketahui.
- Data `data/auth_db.json` dipertahankan untuk kompatibilitas migrasi akun legacy ke Firestore; file tersebut tidak diubah oleh hardening ini.

## Kompatibilitas production
Production tetap menggunakan Firebase Function `authApi` sebagai jalur auth utama. Vercel/server hanya menggunakan local fallback jika `SIDOKTER_LOCAL_AUTH_FALLBACK=true`.

## Catatan rollback
Baseline resmi tetap SIDOKTER Final 1.0.1. Versi ini adalah hardening 1.0.2 dan dapat di-rollback tanpa mengubah baseline.
