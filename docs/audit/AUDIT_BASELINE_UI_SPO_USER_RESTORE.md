# AUDIT — BASELINE UI SPO LOCK + Petugas → User

Tanggal: 2026-09-02

## Tujuan
Mengembalikan source aplikasi ke baseline UI SPO yang telah dikunci, kemudian menerapkan perubahan nomenklatur Petugas → User tanpa mengubah workflow/fungsi baseline.

## Baseline yang dipakai
Source root `src/`, `api/`, `functions/`, `server/`, dan konfigurasi dari `sidokter-SPO-FIX-PROGRESSIVE-TEXTTOOL.zip`. Folder nested `work/` dan `sidokter_work/` tidak dipakai.

## Verifikasi baseline UI SPO
- Progressive workflow tersedia: Jenis SPO → Selanjutnya → Hirarki → Selanjutnya → Batang Tubuh.
- `workflowStep` dan `documentTypeChosen` dipertahankan.
- Tahap 1 tidak membuka hirarki sebelum tombol Selanjutnya.
- Tahap 2 memiliki Kembali dan Selanjutnya.
- Tahap 3 dibuka setelah hirarki siap.
- Halaman depan SPO menggunakan UserLibraryTab/SopTable baseline.
- Fungsi Existing/Legacy, Riviu, numbering, upload, persistence, dan permission tidak direfactor.
- Text Tool toolbar: Strikethrough dan selector ukuran font visible dihapus sesuai baseline UI yang dikunci.

## Rename Petugas → User
- File `PetugasView.tsx` → `UserView.tsx`.
- File `PetugasLibraryTab.tsx` → `UserLibraryTab.tsx`.
- File `PetugasPasswordTab.tsx` → `UserPasswordTab.tsx`.
- Import/export/reference diselaraskan.
- Label, komentar, identifier internal, dan role checks memakai User.
- Tidak ada residual `Petugas/petugas/PETUGAS` di source, kecuali ID akun lama `usr-petugas-pelayanan` yang dipertahankan sebagai legacy data identifier.

## Role compatibility
- Current public roles: `admin | user`.
- Stored legacy/non-admin roles dinormalisasi menjadi `user` di client auth, account read path, persisted session, dan server auth boundary.
- Session lama tidak langsung gagal hanya karena role legacy.
- UI tetap menampilkan User.

## Struktur ZIP
Root project langsung berisi `src/`, `api/`, `functions/`, `server/`, `public/` dan file konfigurasi. Tidak ada nested project `work/` atau `sidokter_work/`.

## Checks
- Node syntax check `functions/index.js`: PASS.
- Residual Petugas selain legacy ID: 0.
- Forbidden visible Strikethrough/font-size selector in RichTextEditor: 0.
- Progressive workflow markers in UserView: PASS.
- ZIP integrity: PASS setelah packaging.
- Production build: NOT RUNNABLE in audit environment because `node_modules` is absent (`vite: not found`). Tidak diklaim PASS.
