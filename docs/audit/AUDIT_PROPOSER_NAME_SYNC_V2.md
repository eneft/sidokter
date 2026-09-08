# Audit — Sinkronisasi Nama Pengusul SPO V2

Tanggal: 2026-09-06

## Tujuan
Menyamakan metadata **Pengusul** pada SPO yang **sudah pernah diajukan/usulan aktivasi** dengan direktori akun user.

## Sumber data
- `users.username` = kunci pencocokan akun.
- `users.name` = **Nama Lengkap User** yang menjadi nilai resmi Pengusul.
- `sop.activationRequestedAt` = penanda bahwa dokumen sudah pernah diusulkan.
- `sop.activationRequestedBy` = field metadata pengusul yang disinkronkan.

## Perubahan
1. Saat Admin memuat direktori akun dan daftar SPO, sistem mencari SPO yang memiliki `activationRequestedAt`.
2. `activationRequestedBy` dicocokkan ke `users.username`.
3. Jika tidak cocok, `creatorName` juga dicoba sebagai sumber username legacy.
4. Jika ditemukan, `activationRequestedBy` diperbarui menjadi `users.name`.
5. Perubahan disimpan melalui `saveSopToLocal`, sehingga tersimpan di IndexedDB dan disinkronkan ke Firestore.
6. Sinkronisasi hanya mengubah `activationRequestedBy`; tidak mengubah nomor, status, hirarki, isi dokumen, accessKeys, atau file.
7. Alur usulan baru tetap menyimpan Nama Lengkap User sejak awal.

## Contoh
`ach.zamroni` + akun `dr. Ach. Zamroni, Sp.An` → Pengusul SPO menjadi `dr. Ach. Zamroni, Sp.An`.

## Pencegahan loop
Effect sinkronisasi dipicu oleh perubahan direktori user atau jumlah SPO. Setelah `activationRequestedBy` sudah menjadi nama lengkap, tidak ada perubahan kedua yang ditulis.

## Audit struktur ZIP
- Isi project berada langsung di root ZIP.
- Tidak ada folder project ganda/nested project packaging.
- Tidak ada perubahan background login.
- Tidak ada perubahan aturan hirarki/security.

## Catatan build
Build produksi belum dapat dijalankan pada environment audit ini karena instalasi dependency `npm ci` mengalami timeout dan `vite` tidak tersedia di `node_modules`. Perubahan kode sudah diperiksa secara statis dan ZIP diuji dengan `unzip -t`.
