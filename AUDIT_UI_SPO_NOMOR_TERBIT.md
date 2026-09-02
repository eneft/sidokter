# AUDIT UI SPO — NOMOR TERBIT

## Status
DIUBAH SESUAI HASIL AUDIT UI 02-09-2026.

## Temuan
UI Nomor Terbit sebelumnya menggunakan dropdown/popover yang muncul di bawah tombol dan mengganggu area kerja SPO.

## Perubahan yang dikunci
1. Dropdown Nomor Terbit dihapus.
2. Tombol `Nomor Terbit (jumlah)` tetap berada di header SPO.
3. Klik tombol membuka modal/panel khusus Nomor Terbit.
4. Informasi utama daftar hanya:
   - Nomor SPO
   - Judul SPO
5. Ditambahkan pencarian berdasarkan nomor atau judul SPO.
6. Hanya reservation berstatus `RESERVED` yang ditampilkan.
7. Nomor yang sudah digunakan (`USED`) tidak ditampilkan sebagai nomor tersedia.
8. Tidak ada metadata tambahan pada daftar utama.
9. Alur SPO Baru, Existing, dan Riviu tidak diubah oleh perubahan UI ini.

## Prinsip UI
Nomor Terbit adalah register nomor yang tersedia untuk SPO Existing, bukan dropdown informasi kecil.

## File yang diubah
`src/components/PetugasView.tsx`

## Catatan audit
Perubahan ini hanya menyentuh UI Nomor Terbit dan mempertahankan sumber data serta filter reservation yang sudah ada.
