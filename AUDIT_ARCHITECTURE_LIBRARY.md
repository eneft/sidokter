# Audit perubahan Library / SK / MOU

Tanggal: 27 Agustus 2026

## Perubahan
- Admin Library dibuat sebagai page tersendiri.
- Library Admin hanya menampilkan SPO berstatus AKTIF serta dokumen SK/MOU.
- SPO draft/review/menunggu pengesahan tidak ditampilkan di Library.
- SK memiliki page sendiri.
- MOU memiliki page sendiri.
- SK/MOU tetap memakai viewer PDF yang sama (`DocumentViewer`).
- Hak edit/hapus/upload SK/MOU tetap hanya Admin melalui page masing-masing.
- Petugas tetap hanya melihat/download SK/MOU.
- Navigasi Admin dipisahkan: Dashboard, Library Dokumen, Dokumen SK, Dokumen MOU.

## Pemeriksaan
- ZIP integrity: LULUS (`unzip -t`).
- Source scan: import `AdminLibraryPage`, state navigation, dan render page terpasang.
- TypeScript syntax check dijalankan, tetapi dependency `node_modules` tidak tersedia dan `npm ci` timeout; sehingga full production build belum dapat diverifikasi di environment ini.
- Temuan tipe diperbaiki pada referensi nomor SPO: menggunakan `sopNumber` sesuai `SopDocument`.

## Catatan
PDF engine / baseline SPO tidak diubah.
