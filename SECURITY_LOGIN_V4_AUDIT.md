# SECURITY LOGIN V4 — SUPERSEDED NOTE

Dokumen audit versi sebelumnya yang mensyaratkan `SIDOKTER_BOOTSTRAP_SECRET` **sudah tidak berlaku untuk baseline V5 ini**.

Baseline V5 menggunakan **one-time first-admin bootstrap tanpa bootstrap secret** agar instalasi tetap dapat berjalan tanpa konfigurasi Secret Manager tambahan.

Aturan V5:
- Admin pertama dibuat dari halaman login.
- Password Admin wajib kuat (minimal 12 karakter, huruf besar, huruf kecil, angka, simbol).
- Setelah Admin pertama berhasil dibuat, endpoint bootstrap otomatis terkunci.
- Tidak ada credential default yang dikemas dalam source/ZIP.
- Login normal tetap menggunakan authentication service dan multi-device session.

Dokumen ini dipertahankan hanya sebagai histori audit dan tidak boleh dijadikan instruksi deployment V5.
