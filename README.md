# SIDOKTER SOEGIRI

**Sistem Dokumen Terpadu Soegiri** adalah aplikasi pengelolaan dokumen RSUD Dr. Soegiri Lamongan.

## Arsitektur Utama

SIDOKTER saat ini menggunakan:

- React + Vite untuk frontend
- Firebase Firestore untuk data aplikasi
- Firebase Storage untuk penyimpanan berkas bersama
- Firebase Cloud Functions untuk backend tepercaya
- Firebase Hosting sebagai production hosting utama
- Vercel sebagai deployment/compatibility target yang terhubung ke backend Firebase

SIDOKTER tidak memerlukan Gemini API untuk fungsi runtime production saat ini.

## Menjalankan Secara Lokal

**Prasyarat:** Node.js 22

1. Install dependency:
   ```bash
   npm install
   npm install --prefix functions
   ```
2. Salin konfigurasi environment yang diperlukan dari `.env.example` ke environment lokal Anda.
3. Jalankan aplikasi:
   ```bash
   npm run dev
   ```

## Build

```bash
npm run build:client
```

## Verifikasi Functions

```bash
npm run verify:functions
```

## Production

Target Firebase production yang digunakan SIDOKTER adalah project `sidokter-soegiri`. Deployment production dilakukan melalui pipeline GitHub Actions yang sudah tersedia di repository.

> Jangan menambahkan secret, service-account private key, atau credential sensitif ke source code/repository.
