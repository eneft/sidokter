# AUDIT BADGE AKSES USER — STRUKTURAL

## Rule
- `STRUKTURAL` adalah elevated badge untuk akun `User`.
- Prioritas akses: Administrator > Badge STRUKTURAL > Hirarki User.
- Badge STRUKTURAL memberikan akses ke seluruh dokumen SPO tanpa bergantung pada hirarki unit kerja.
- Dokumen contoh/master (`isExampleOnly`) tetap hanya untuk Administrator.
- Badge tersimpan pada profil `UserAccount.badges` dan ikut dibawa ke `UserSession`.
- Perubahan badge tersinkron melalui profile guard/session refresh.

## Implementasi
- `src/types.ts`: menambah `UserBadge` dan `badges` pada UserAccount/UserSession.
- `src/lib/authService.ts`: membawa badge saat login dan refresh session.
- `src/utils/soegiriStructure.ts`: badge STRUKTURAL mengalahkan pengecekan hirarki pada akses dokumen.
- `src/lib/soegiriStructure.ts`: mirror access rule untuk kompatibilitas.
- `src/App.tsx`: User STRUKTURAL tidak dibatasi subscription SOP berdasarkan division; perubahan badge realtime diterapkan ke session.
- `src/components/UserManagementModal.tsx`: Admin dapat memberi/mencabut badge STRUKTURAL dan badge ditampilkan pada daftar user.
- `src/components/UserView.tsx`: akses dokumen mengikuti badge, tanpa mengubah batasan hirarki untuk workflow input/penomoran.
- `src/components/UserLibraryTab.tsx`: badge STRUKTURAL diperlakukan sebagai akses tidak terbatas dan panel `Akses: ... hirarki unit kerja` tetap tidak ditampilkan sesuai baseline 21:14.

## Non-goals
- Tidak mengubah numbering SPO.
- Tidak mengubah pemisahan SPO Baru / Existing / Riviu.
- Tidak mengubah baseline UI depan SPO selain aturan 21:14 yang sudah dikunci.
- Tidak memberi User badge STRUKTURAL hak Admin untuk edit/hapus/management.
