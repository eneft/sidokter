# BASELINE RULE — ALL & HIRARKI TUJUAN SPO

1. Identitas akses user: `ALL — SEMUA HIRARKI`.
2. `ALL` berarti hak akses global terhadap seluruh hirarki yang tersedia.
3. Dropdown **HIRARKI TUJUAN SPO** tetap muncul.
4. Dropdown tersebut menentukan lokasi/identitas dokumen yang sedang dibuat, bukan hak akses user.
5. User ALL dapat memilih seluruh hirarki master yang aktif.
6. Setelah memilih bidang, pilihan turun mengikuti struktur: Sub-Bidang/Unit → Instalasi/Unit → level berikutnya sesuai master.
7. Nomor SPO mengikuti hirarki tujuan nyata, misalnya `PEN / 1.3 / xxx / 2026`.
8. `ALL` tidak boleh menjadi kode hirarki pada nomor SPO.
9. User tanpa ALL hanya dapat memilih hirarki sesuai assignment/kewenangannya.
10. Badge STRUKTURAL adalah rule terpisah untuk akses dokumen dan tidak boleh dicampur dengan ALL.
11. Admin memiliki cakupan global dan tetap harus memilih target hirarki nyata ketika membuat/menomori SPO.

### Model mental
```text
ALL — SEMUA HIRARKI
        │
        └── Hak akses global
                │
                ▼
        HIRARKI TUJUAN SPO
                │
                ├── Bidang
                ├── Sub-Bidang / Unit
                ├── Instalasi / Unit
                └── Level bawah sesuai master
                │
                ▼
        NOMOR SPO MENGIKUTI TARGET
        PEN / 1.3 / 001 / 2026
```
