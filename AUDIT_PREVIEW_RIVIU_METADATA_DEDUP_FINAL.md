# AUDIT — Preview SPO Riviu Metadata Dedup Final

Tanggal: 2026-09-06

## Perubahan
1. Preview SPO Riviu tidak lagi menampilkan card/detail lama yang menduplikasi `SPO Lama yang Diriviu`, `Alasan Riviu`, dan nama berkas bukti.
2. Metadata utama Riviu sekarang menjadi satu sumber tampilan untuk identitas dokumen: Judul SPO, Nomor SPO, Pengusul, Unit/Pemilik, Revisi, tanggal pengajuan, tanggal terbit/berlaku, Unit Terkait, Penetap, SPO lama yang diriviu, dan alasan riviu.
3. Field `Pengusul` memprioritaskan `activationRequestedBy` (nama akun yang mengajukan/propose), dengan fallback ke `creatorName` untuk data lama.
4. Berkas bukti SPO lama tetap tersedia dalam satu card ringkas tersendiri, tanpa mengulang nomor/alasan riviu.
5. Warna metadata Riviu diseragamkan dengan metadata preview SPO lainnya (navy/slate/white), tidak memakai card amber/violet khusus jenis dokumen.

## Tidak diubah
- Background login terbaru tetap dipertahankan.
- Aturan hirarki/security tidak diubah.
- Format dokumen A4 dan renderer PDF tidak diubah.
- Struktur Firebase tidak diubah.

## Build
Build penuh tidak dapat dijalankan di environment audit karena dependency npm belum tersedia/cache tidak lengkap (`zod` tidak tersedia pada npm offline). Source perubahan sudah diperiksa secara statis dan struktur ZIP diaudit agar root project tidak dibungkus folder project ganda.
