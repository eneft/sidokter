# Audit Perubahan Nama Library Dashboard

Perubahan:
- Card dashboard yang sebelumnya `Library (SPO Aktif)` dihapus seluruhnya.
- Grid statistik dashboard disesuaikan dari 4 kolom menjadi 3 kolom agar tiga card utama tetap rapi.
- Menu sidebar User: `Library` -> `Arsip Digital`.
- Menu sidebar Admin: `Library` -> `Arsip Digital`.
- Menu mobile User: otomatis mengikuti label `Arsip Digital` karena memakai sumber item yang sama.
- Fungsi tab internal tetap `library`; hanya label UI yang berubah.
- Tidak mengubah data, routing tab, hak akses, badge, numbering, workflow SPO, SK, atau MOU.

Validasi statis:
- Tidak ada teks `Library (SPO Aktif)` di source TSX.
- Label sidebar User/Admin menjadi `Arsip Digital`.
- Card dashboard Library dihapus.
- Build penuh belum dapat dijalankan karena dependency `node_modules` tidak tersedia di environment ini.
