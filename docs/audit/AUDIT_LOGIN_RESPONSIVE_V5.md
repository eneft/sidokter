# AUDIT LOGIN RESPONSIVE V5

Tanggal: 2026-09-05

## Permintaan
- Seluruh tampilan mobile dan tablet harus pas dengan viewport.
- Mobile/tablet harus menjadi komposisi mandiri, bukan desktop yang dikecilkan.
- Background sketch RSUD harus tampil pada opacity 100%.
- Tidak boleh ada scroll pada halaman login normal.

## Perubahan
- Login container diposisikan fixed ke viewport (`inset: 0`, `100vw`, `100dvh`).
- Background image dipaksa memenuhi viewport dengan `object-fit: cover`.
- Opacity background menjadi `1` (100%).
- Blur background dihapus (`filter: none`).
- Overlay putih 10% dihapus agar opacity efektif tetap 100%.
- Mobile <=639px memakai komposisi portrait khusus: header compact + login card terpusat; branding desktop disembunyikan.
- Tablet 640-1023px memakai komposisi khusus: header compact + login card terpusat; branding desktop disembunyikan.
- Breakpoint short-phone <=760px memperkecil elemen vertikal agar form normal tetap masuk viewport.
- Footer login disembunyikan pada mobile/tablet untuk menjaga satu layar.
- Tidak mengubah handler autentikasi, Firebase, session, atau workflow aplikasi.

## Static checks
- `LoginPage.tsx` tetap memiliki `authenticateUser` dan `provisionInitialAdmin`.
- `login-background.png` tersedia di `public/`.
- Tidak ada `backdrop-filter` pada blok V5.
- `opacity: 1 !important` diterapkan pada background.
- `filter: none !important` diterapkan pada background.
- `100dvh` dan `100vw` diterapkan pada container.
- Mobile/tablet menggunakan `overflow: hidden` melalui container utama.
