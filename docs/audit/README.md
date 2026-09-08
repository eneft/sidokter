# SIDOKTER SOEGIRI — Offline Prototype

Prototype Sistem Dokumen Terpadu Soegiri yang berjalan tanpa layanan database cloud.

## Penyimpanan
- Data SPO, akun, konfigurasi, maintenance, dan audit: `localStorage`.
- File PDF, scan, dan lampiran: `IndexedDB` melalui local file cache.
- Editor gambar: gambar dikompresi dan ditanam sebagai data URL lokal.

## Jalankan
```bash
npm install
npm run dev
```
Buka `http://localhost:3000`.

## Akun awal
Akun awal tidak menggunakan credential default yang ditanam di aplikasi. Administrator harus diprovision melalui prosedur server-side yang aman.

## Catatan prototype
Data tersimpan di browser/perangkat yang digunakan. Backup/restore aplikasi tetap diperlukan sebelum membersihkan data browser. Versi ini belum menyediakan sinkronisasi antar-PC.

## PDF
Generator PDF tetap berjalan melalui endpoint lokal `/api/pdf` menggunakan Puppeteer dan Chromium.

## Struktur domain dokumen
- `src/lib/sopService.ts` — SPO + penomoran SPO.
- `src/lib/skService.ts` — SK.
- `src/lib/mouService.ts` — MOU.
- `src/lib/documentLibraryService.ts` — penyimpanan bersama untuk SK/MOU.
- `src/lib/accountService.ts` — akun pengguna.
- `src/lib/backupService.ts` — backup/restore seluruh sistem.
- `functions/` — Firebase Functions.

File root lama yang menduplikasi source `src/` telah dihapus.
