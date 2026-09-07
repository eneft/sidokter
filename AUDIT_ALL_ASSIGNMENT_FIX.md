# SIDOKTER — Audit & Fix `ALL` Hierarchy Access

## Temuan
User dengan assignment `ALL` sebelumnya kehilangan akses SPO karena `ALL` dibuang pada dua lapisan:
- Firebase Custom Claims (`functions/index.js`) mengabaikan `ALL` dan menghasilkan `globalHierarchyAccess: false`.
- Client `sopService.ts` hanya menganggap Admin/STRUKTURAL sebagai global access.

Akibatnya user biasa dengan assignment `ALL` menghasilkan query SPO kosong.

## Perbaikan
1. `functions/index.js`
   - Assignment `ALL` sekarang menghasilkan `globalHierarchyAccess: true`.
   - `ALL` tetap tidak dimasukkan sebagai Firestore `accessKeys`.
2. `src/lib/sopService.ts`
   - `ALL` pada `assignments`, `divisionCodes`, atau legacy `divisionCode` sekarang dihitung sebagai `globalAccess`.
3. `src/utils/soegiriStructure.ts` dan `src/lib/soegiriStructure.ts`
   - `userCanAccessSop()` menganggap assignment `ALL` sebagai akses global untuk User maupun Admin.
4. Tidak mengubah background, UI login, SK/MOU, numbering, TTD/stempel, atau workflow bisnis.

## Security model
- Admin: global SPO access.
- User + assignment `ALL`: global SPO access.
- User + badge `STRUKTURAL`: global SPO access.
- User dengan assignment hirarki spesifik: hanya SPO yang sesuai hirarki + turunannya.
- User tanpa assignment valid: tidak mendapat SPO melalui scoped query.
- `ALL` bukan access-key dokumen; ia adalah scope global.

## Verifikasi statis
- `functions/index.js`: `node --check` PASS.
- ZIP root tetap bersih; tidak dibuat folder project ganda.
- Background file tidak disentuh pada revisi ini.

## Catatan deploy
Perubahan `functions/index.js` harus dideploy ke Firebase Functions agar Custom Claims baru diterapkan. User dengan token lama perlu login ulang/refresh token setelah claim diperbarui.
