# AUDIT LOGIN BRAND — 1.0.3

## Perubahan
- Header login tidak lagi memakai `public/sidokter-login-brand.png`.
- Identitas header sekarang dibangun dari logo resmi RSUD `public/logo_soegiri_transparent.png` + typography/CSS SIDOKTER.
- Wordmark SIDOKTER: `SIDO` navy + `KTER` teal.
- Subtitle dan nama RSUD dibuat sebagai teks/CSS, sehingga mudah responsive dan tidak membutuhkan asset gabungan.
- `sidokter-login-brand.png` dihapus dari package karena sudah tidak direferensikan.

## Yang tidak diubah
- Firebase/authentication/session.
- API/server/Vercel configuration.
- Workflow aplikasi.
- Logo RSUD existing yang dipakai komponen lain.

## Audit referensi
- `sidokter-login-brand.png`: tidak ada referensi source aktif.
- `logo_soegiri_transparent.png`: dipakai LoginPage dan HospitalLogo.

## Build
- `npm run build` belum dapat dijalankan karena dependency `vite` tidak tersedia di `node_modules` pada environment audit. Percobaan `npm ci --ignore-scripts` mengalami timeout. Tidak ada klaim build PASS.
