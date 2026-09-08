# AUDIT — SPO Existing PDF Preview Fix — 2026-09-08

## Scope
Memperbaiki pratinjau PDF asli SPO Existing dan memastikan klasifikasi Existing Replacement tetap memakai jalur Existing.

## Perubahan
- `src/lib/sopService.ts`: upload file binary ke cloud storage kini ditunggu sebelum sinkronisasi Firestore, sehingga `fileUrl` / `signedScanUrl` / `oldFileUrl` tersimpan bersama dokumen.
- `src/components/SopDetailModal.tsx`: pratinjau Existing memprioritaskan URL cloud permanen, memakai resolver URL, dan mengenali `isExistingReplacement` sebagai Existing.
- `src/components/AktivasiSopModal.tsx`: `isExistingReplacement` masuk jalur Existing, sehingga tidak meminta TTD/stempel tambahan.
- `src/App.tsx`: aktivasi `isExistingReplacement` diperlakukan sebagai Existing dan metadata PDF asli dipertahankan saat aktivasi.

## Aturan yang dipertahankan
- Existing menampilkan PDF asli.
- Existing tidak menambahkan TTD/stempel baru.
- Baru/Riviu tetap menggunakan alur aktivasi dan pengesahan masing-masing.
- Security/hirarki SPO tidak diubah.

## Verifikasi
- ZIP diuji dengan `unzip -t`.
- Tidak ada nested project folder.
- Pemeriksaan parser TypeScript terhadap file yang berubah tidak menemukan syntax error; full typecheck/build tidak diklaim PASS karena dependency `node_modules` pada environment audit tidak lengkap.
