# FINAL UI/UX HALAMAN SIDOKTER

Status: **BASELINE AKTIF**

## Prinsip
1. Tampilan existing dipertahankan; tidak ada redesign total, hanya perapian.
2. Card responsive/flexible: mobile 1 kolom, tablet 2 kolom, desktop 3 kolom. Tidak menggunakan fixed width yang menyebabkan overflow.
3. Seluruh halaman wajib responsive, bukan hanya card.
4. Visual tenang, administratif, clean, profesional, ringan, dan tidak dipenuhi badge/button besar.

## Tabel SPO
Kolom resmi: **Nomor SPO | Judul SPO | Status | Aksi**.

- Judul SPO tidak oversized dan konsisten dengan teks tabel.
- Judul SPO clickable/tappable dan membuka Preview SPO.
- Tidak ada tombol Preview terpisah di tabel.
- Tidak ada tombol Download di tabel.
- Download, bila user berhak, tersedia pada halaman Preview.
- Tombol **Buka SPO** tetap boleh sebagai aksi utama.
- Hindari kolom dan aksi redundant.

## Navigasi
- Fungsi **Sinkronkan Nomor** hanya memiliki satu akses utama yang jelas; tidak boleh muncul sebagai tombol duplikat di header dan card/module yang sama.

## Permission UI
UI/UX tidak boleh mengubah pemisahan hak akses: **ADMIN Root != VERIFIKATOR != STRUKTURAL**.

- STRUKTURAL tetap memiliki privilege SK/MOU upload, view, dan download sesuai scope.
- VERIFIKATOR bukan Admin Root dan tidak otomatis memperoleh hak SK/MOU.
- ADMIN Root tetap memiliki kontrol administratif penuh.
