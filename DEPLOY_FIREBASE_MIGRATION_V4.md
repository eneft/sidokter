# SIDOKTER Firebase Migration Fix V4

## Perbaikan utama

1. Firebase Admin initialization sekarang selalu memastikan **default app `[DEFAULT]`** tersedia. Tidak lagi hanya memeriksa jumlah app (`getApps().length`).
2. `initializeApp()` memakai Application Default Credentials dari service account runtime Google Cloud; tidak membaca JSON key sebagai credential runtime.
3. `requireAuth()` dapat memulihkan UID dari **server-side session** ketika request hanya membawa `X-Session-Id` (penting untuk preview/download PDF).
4. Protected endpoint tidak lagi membuat session baru secara otomatis. Session harus sudah dibuat oleh proses login dan belum dicabut.
5. Storage preview/download tetap private dan wajib melalui auth/session SIDOKTER.
6. `DocumentViewer` local fallback sekarang mengirim session UID, username, dan Firebase ID token bila tersedia.
7. Download private storage tidak lagi fallback ke `window.open()`, karena browser tidak dapat mengirim header session pada navigasi langsung.

## Function yang terdampak

- `authApi`
- `storageApi`
- `createNotification`

## Deploy FINAL ke Firebase Hosting + seluruh Functions

**Jangan deploy Hosting saja.** Firebase Hosting hanya menerbitkan `dist`; Cloud Functions harus ikut dideploy. Versi ini juga menambahkan `hierarchyApi` karena endpoint `/api/hierarchy` sebelumnya hanya ada di `server.ts` dan tidak ikut hidup saat aplikasi dipasang sebagai Firebase Hosting.

Dari root project:

```bash
firebase use sidokter-soegiri
npm run verify:functions
npm run build:client
firebase deploy --only functions,hosting,firestore,storage
```

Atau cukup:

```bash
npm run deploy:firebase
```

Function yang harus terdeploy:
- `authApi`
- `storageApi`
- `pdfApi`
- `createNotification`
- `hierarchyApi`

Semua HTTP function dan Hosting diarahkan ke region `asia-southeast2`. `createNotification` adalah callable function dan dipanggil melalui Firebase Functions SDK, jadi tidak membutuhkan rewrite Hosting.

## Setelah deploy

Uji berurutan:

1. Buka `https://sidokter-soegiri.web.app`.
2. Login SIDOKTER.
3. Pastikan request login menuju `/api/auth` dan tidak 404/405.
4. Buka dokumen Existing/PDF; pastikan preview PDF tampil.
5. Klik Download dan pastikan file terunduh.
6. Upload PDF baru dan pastikan metadata + file tersimpan.
7. Buka/ubah Master Data Hirarki; pastikan `/api/hierarchy` tidak 404.
8. Uji notifikasi; `createNotification` harus berhasil melalui region `asia-southeast2`.
9. Cek log Cloud Functions: tidak boleh muncul `UNAUTHENTICATED`, `app/no-app`, atau `HIERARCHY_ERROR` pada operasi normal.
10. Pastikan halaman tetap SPA setelah refresh route apa pun karena rewrite `** -> /index.html`.
