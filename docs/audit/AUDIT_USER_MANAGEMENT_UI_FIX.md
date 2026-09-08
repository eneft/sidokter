# AUDIT — USER MANAGEMENT UI FIX

Tanggal: 2026-09-06

## Perubahan
- Modal manajemen akun diperlebar dari `max-w-4xl` menjadi `max-w-6xl` agar kolom aksi tidak terpotong.
- Kolom password mentah dihapus dari tabel; status credential tetap ditampilkan. Password tidak perlu menjadi kolom daftar akun.
- Kolom Aksi dibuat `sticky` di sisi kanan pada desktop/tablet sehingga tombol **Edit** selalu terlihat.
- Tombol edit sekarang memiliki label **Edit**, bukan ikon saja, sehingga fungsi utama lebih mudah ditemukan.
- Akses bidang + hirarki diringkas dalam satu kolom agar informasi lebih efisien.
- Ditambahkan daftar akun versi mobile berbentuk card; tidak memakai tabel horizontal yang memaksa scroll.
- Pada mobile tersedia tombol **Edit Akun** dan **Hapus** secara eksplisit.
- Tidak mengubah service autentikasi, data Firebase, rule hirarki, atau fungsi CRUD.

## Packaging
- Project dikemas langsung pada root ZIP.
- Tidak memasukkan `node_modules` atau `dist`.

## Verification
- File perubahan utama: `src/components/UserManagementModal.tsx`.
- Instalasi dependency/build penuh tidak dapat diselesaikan di container karena `npm ci` mengalami transport timeout. Karena itu build PASS tidak diklaim.
