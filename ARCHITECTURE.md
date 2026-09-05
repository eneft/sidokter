# SIDOKTER SOEGIRI — Struktur Source

## Domain dokumen
- `src/components/*Sop*` / `Sop*` — UI SPO.
- `src/lib/sopService.ts` — data SPO dan penomoran SPO saja.
- `src/lib/skService.ts` — operasi domain SK.
- `src/lib/mouService.ts` — operasi domain MOU.
- `src/lib/documentLibraryService.ts` — storage bersama untuk file/data SK dan MOU; bukan domain SPO.
- `src/lib/backupService.ts` — orkestrator backup/restore seluruh sistem.

## Akun & sistem
- `src/lib/accountService.ts` — akun pengguna dan backup/restore akun.
- `src/lib/authService.ts` — autentikasi, session, audit login.
- `src/lib/maintenanceService.ts` — mode pemeliharaan.
- `src/lib/localDataService.ts` — bootstrap data lokal.

## Backend/deployment
- `api/pdf.ts` — endpoint PDF Vercel/API.
- `server.ts` + `server/pdfRenderer.ts` — server dan renderer PDF utama.
- `functions/index.js` + `functions/package.json` — Firebase Functions; package ini sengaja tidak memiliki script `build` karena bukan root application build.
- `package.json` — package root aplikasi dan satu-satunya sumber `npm run build`.

## Prinsip
1. Jangan menambahkan file source React/TypeScript duplikat di root.
2. Jangan memindahkan SK/MOU ke `sopService.ts`.
3. Backup boleh terpusat, tetapi mengambil data melalui service domain masing-masing.
4. Session aktif tidak menjadi data backup.
