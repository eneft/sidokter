# BASELINE — ALL & HIRARKI TUJUAN SPO

## Aturan wajib

1. Identitas akses user dengan assignment global ditampilkan sebagai `ALL — SEMUA HIRARKI`.
2. `ALL` adalah hak akses global/cakupan pilihan hirarki, bukan hirarki dokumen.
3. Label form wajib menggunakan `HIRARKI TUJUAN SPO` untuk pilihan lokasi/identitas dokumen yang sedang dibuat.
4. User dengan `ALL` mendapat seluruh hirarki master aktif pada dropdown tujuan.
5. Setelah memilih bidang, tampilkan turunan hirarki sesuai master: Sub Bagian/Unit, Instalasi/Unit, Poli/Unit, Sub Unit bila tersedia.
6. Nomor SPO selalu mengikuti hirarki tujuan yang dipilih, contoh `PEN / 1.3 / xxx / 2026`.
7. `ALL` tidak boleh muncul sebagai kode hirarki pada nomor SPO.
8. User tanpa `ALL` hanya boleh melihat dan memilih hirarki sesuai assignment/kewenangannya.
9. Pemilihan hirarki tujuan tidak boleh ditampilkan atau diproses seolah-olah mengubah hak akses user.
10. Badge STRUKTURAL tetap terpisah dari ALL: badge mengatur hak akses dokumen, sedangkan ALL mengatur cakupan pilihan hirarki untuk pembuatan SPO.

## Prinsip UI

`Identitas Akses User: ALL — SEMUA HIRARKI`

↓

`HIRARKI TUJUAN SPO`

↓

`[PEN] Bidang Penunjang`

↓

`Sub Bagian/Unit → Instalasi/Unit → Poli/Unit → Sub Unit`

↓

Nomor: `PEN / 1.3 / xxx / 2026`
