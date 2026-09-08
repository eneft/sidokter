# AUDIT PREVIEW SPO — STANDARDISASI SEMUA JENIS
Tanggal: 2026-09-06

## Scope
Standardisasi panel metadata preview untuk SPO Baru, SPO Existing/Lama, dan SPO Hasil Riviu.

## Perubahan
- Satu komponen `PreviewMetadata` dipakai untuk ketiga jenis SPO sehingga struktur dan warna konsisten.
- Urutan informasi standar: Judul SPO, Nomor SPO, Pengusul, Unit/Pemilik, Revisi, Tanggal Pengajuan, Tanggal Terbit/Berlaku, Penetap.
- `Unit Terkait` tidak ditampilkan sebagai metadata preview karena merupakan bagian batang tubuh dokumen, bukan identitas metadata.
- Khusus Riviu: `SPO Lama yang Diriviu` dan `Alasan Riviu` tetap ditampilkan sebagai informasi tambahan compact.
- Ukuran card metadata dipadatkan agar efisien dan tidak mendominasi preview.
- Warna ketiga jenis SPO tetap menggunakan visual baseline yang sama; tidak dibuat warna khusus per jenis.
- Pengusul tetap di-resolve dari direktori akun ke `Nama Lengkap User`, dengan fallback data lama bila akun tidak ditemukan.

## Tidak Diubah
- Logic hirarki/security akses dokumen.
- Firebase/auth/password.
- Background/login.
- Rendering dan layout dokumen A4/PDF.
- Data sumber SPO.

## Audit Struktur ZIP
Root ZIP berisi file project secara langsung, tanpa folder project pembungkus/nested project folder.
