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

## Setelah deploy

Uji berurutan:

1. Login SIDOKTER.
2. Buka dokumen Existing/PDF.
3. Pastikan preview PDF tampil.
4. Klik Download dan pastikan file terunduh.
5. Upload PDF baru dan pastikan metadata + file tersimpan.
6. Cek log `storageApi`: tidak boleh muncul `UNAUTHENTICATED`.
7. Cek log `createNotification`: tidak boleh muncul `app/no-app`.
