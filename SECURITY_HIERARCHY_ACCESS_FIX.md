# SECURITY FIX — HIRARKI AKSES DOKUMEN SPO

Tanggal audit: 2026-09-06

## Temuan kritis
Sebelumnya `firestore.rules` memberikan `allow read: if signedIn()` pada `/sops`, sehingga setiap akun Firebase yang berhasil login dapat membaca seluruh koleksi SPO secara langsung. Filter hirarki di React hanya merupakan UI/client-side control dan dapat dilewati.

Selain itu, cache IndexedDB/localStorage dan listener realtime sebelumnya dapat membawa dokumen dari sesi/akun sebelumnya ke sesi berikutnya pada perangkat yang sama.

## Perbaikan
1. Setiap SPO sekarang disimpan dengan `accessKeys` yang dibentuk dari kode bidang + seluruh ancestor hirarkinya.
2. Custom Firebase token user membawa `hierarchyKeys` sesuai assignment akun.
3. User dengan badge `STRUKTURAL` dan Admin tetap memiliki akses global sesuai baseline.
4. Firestore rules sekarang menolak pembacaan SPO jika `accessKeys` tidak beririsan dengan `hierarchyKeys` token.
5. Query Firestore user memakai `array-contains-any` terhadap access keys, bukan mengambil seluruh koleksi lalu menyaring di browser.
6. Listener notifikasi realtime juga dibatasi dengan query hirarki.
7. Local IndexedDB tidak lagi menggabungkan dokumen hasil sync dari hirarki lama dengan hirarki sesi baru.
8. Cache `soegiri_sops_last_good` disaring menggunakan kontrol hirarki sebelum dipakai.
9. Final Library dan detail modal memiliki defense-in-depth check tambahan.
10. Ditambahkan migrasi server `migrate-sop-access` yang otomatis dipanggil saat Admin login untuk memberi `accessKeys` pada dokumen SPO lama.

## Validasi
- `node --check functions/index.js`: PASS
- JSON `package.json` dan `firebase.json`: PASS
- Static assertions security boundary: PASS
- `npm run build` belum dapat dijalankan di environment audit karena `node_modules` tidak tersedia.

## Catatan deployment
Perbaikan server-side baru aktif setelah Firebase Functions dan Firestore Rules dari ZIP ini dideploy ke project Firebase yang digunakan SIDOKTER.
