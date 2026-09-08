# AUDIT RULE ALL — HIRARKI TUJUAN SPO

Tanggal audit: 2026-09-02
Sumber: ZIP latest `SIDOKTER-ALL-HIRARKI-TUJUAN-SPO-FIX.zip`

## Status: PASS

Rule ALL sudah ada di source dan **tidak perlu ditumpuk dengan logic ALL baru**.

### Hasil verifikasi
- `hasAllHierarchyAssignment` mendeteksi assignment `ALL`.
- `hasGlobalHierarchyAccess` membedakan akses global ALL dari badge.
- User/Admin ALL menggunakan assignment global sintetis sehingga hirarki lama tidak menjadi pembatas.
- UI menampilkan `ALL — SEMUA HIRARKI` sebagai **identitas akses user**.
- UI menggunakan label **HIRARKI TUJUAN SPO** untuk target dokumen.
- User ALL mendapat pilihan seluruh kategori hirarki master aktif.
- Setelah kategori dipilih, pilihan turun mengikuti struktur hirarki.
- Validasi submit mewajibkan target hirarki nyata untuk akses global.
- Nomor SPO menggunakan target yang dipilih dan tidak menggunakan `ALL` sebagai kode nomor.
- User tanpa ALL tetap dibatasi assignment yang dimiliki.
- Badge STRUKTURAL tetap merupakan rule terpisah.

## Model aturan final

`ALL = hak akses global`

`HIRARKI TUJUAN SPO = lokasi/identitas dokumen yang dibuat`

`BADGE STRUKTURAL = hak akses dokumen khusus`

Ketiganya **tidak boleh dicampur dalam satu logic**.

## Catatan penting
`ALL` bukan pilihan target nomor SPO. Target nomor harus selalu berupa hirarki nyata, contoh:

`PEN / 1.3 / 001 / 2026`
