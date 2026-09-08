# Audit — Sinkronisasi Nama Pengusul SPO

Tanggal: 2026-09-06

## Perubahan
1. Preview SPO sekarang menerima direktori akun (`users`) untuk menyelesaikan `activationRequestedBy` yang masih berupa username menjadi `UserAccount.name` / Nama Lengkap.
2. Prioritas tampilan Pengusul: nama lengkap akun yang username-nya cocok -> nilai `activationRequestedBy` -> `creatorName` -> `-`.
3. Saat user mengajukan usulan aktivasi, `activationRequestedBy` disimpan dari `UserAccount.name` berdasarkan username sesi, dengan fallback ke `userSession.name`.
4. Perbaikan berlaku pada preview SPO Baru, Existing, dan Riviu tanpa mengubah aturan hirarki/security.

## Contoh
username: `ach.zamroni`
nama lengkap: `dr. Ach. Zamroni, Sp.An`
=> Pengusul: `dr. Ach. Zamroni, Sp.An`

## Validasi
- Tidak ada field password yang disentuh.
- Tidak ada perubahan background login.
- Tidak ada perubahan aturan akses dokumen/hirarki.
- ZIP dikemas ulang dengan isi project langsung di root.
