# AUDIT FINAL — BASELINE SIDOKTER SPO + Petugas → User

## Scope
Audit dilakukan terhadap ZIP `SIDOKTER-SPO-USER-BASELINE-LOCKED-FINAL.zip` sebelum packaging ulang.

## Baseline protected
- Halaman depan SPO: tabel/list desktop, Nomor + Judul sebagai informasi utama.
- Progressive form: Jenis SPO → Selanjutnya → Hirarki → Selanjutnya → Batang Tubuh.
- Pemilihan jenis tidak langsung membuka hirarki.
- Tahap selesai auto-minimize.
- Kembali/Selanjutnya minimalis.
- Desktop batang tubuh A4; tablet/mobile responsive.
- Text Tool tidak memuat Strikethrough, font-size selector 10/12, atau tool yang tidak berguna.
- Existing/Legacy, Riviu, numbering, persistence, permission dan workflow protected.

## Petugas → User
- UI/component names menggunakan User.
- `UserRole` = `admin | user`.
- Legacy role `petugas` dinormalisasi menjadi `user` pada compatibility layer.
- Legacy account identifier dipertahankan agar data lama tidak putus.
- Session persisted dinormalisasi melalui `normalizeRole`.
- Server session juga menormalisasi role.

## Findings & fixes
- Fixed dead RichTextEditor font-size state/handler yang sudah tidak dipakai UI.
- Fixed dead strike formatting state/query yang sudah tidak dipakai toolbar; dukungan sanitizer untuk konten lama tetap dipertahankan agar dokumen existing tidak rusak.

## Verification
- No `Petugas/petugas/PETUGAS` residual in application source, excluding intentional legacy identifier/comment audit documentation.
- No filenames containing `Petugas`.
- `functions/index.js` syntax check: PASS.
- ZIP integrity: to be checked after packaging.
- Full `npm run build`: NOT CLAIMED PASS unless dependencies are installed and build actually executes.
