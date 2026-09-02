# Audit UI Form Input SPO — Iterasi 2

Perubahan UI non-breaking:
- Hirarki/unit kerja dipadatkan secara visual tanpa mengubah state, selector, atau handler.
- Banner warning besar dihapus dari tampilan; validasi dan `missingSections` tetap berjalan dan tetap menjadi sumber validasi submit.
- Petunjuk informasi besar di atas lembar tabel dihapus.
- Text Tool di mode lembar tabel dibuat collapsed by default; seluruh command toolbar tetap tersedia saat dibuka.
- Live Form A4 dan seluruh fungsi editor/penyimpanan tidak diubah.

Aturan: UI/UX boleh berubah, fungsi bisnis existing tidak boleh berubah.
