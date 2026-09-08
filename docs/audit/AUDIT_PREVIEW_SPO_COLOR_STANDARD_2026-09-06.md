# AUDIT PREVIEW SPO — COLOR STANDARD

Tanggal: 2026-09-06
Basis: SIDOKTER_USER_MANAGEMENT_RESTORE_FINAL.zip

## Perubahan
- SPO Existing/Lama tidak lagi memakai palet ungu sebagai identitas jenis dokumen.
- SPO Riviu tidak lagi memakai palet amber/orange sebagai identitas jenis dokumen.
- Identitas preview Existing dan Riviu sekarang memakai palet primary yang sama: blue/navy.
- Tombol utama preview (Simpan PDF, Preview PDF, Unduh PDF/Bukti) diseragamkan ke primary navy.
- Tombol Edit/Ubah Nomor memakai gaya secondary navy yang sama.
- Badge/status tetap memakai warna semantik: hijau untuk aktif, amber untuk kondisi menunggu/peringatan, merah untuk error/tidak aktif.
- Panel error "PDF belum tersedia" tetap amber karena amber berfungsi sebagai warning, bukan identitas jenis SPO.

## Prinsip final
Warna tidak membedakan SPO Baru, SPO Existing, dan SPO Riviu. Jenis dokumen dibedakan melalui label teks/metadata. Warna hanya menunjukkan fungsi, status, atau warning.

## Verifikasi struktur ZIP
Project akan dipaketkan langsung dari root project. Tidak ada folder pembungkus project ganda.
