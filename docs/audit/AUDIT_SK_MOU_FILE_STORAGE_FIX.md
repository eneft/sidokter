# AUDIT SK / MOU — FILE VIEW & DOWNLOAD

## Temuan Kritis

SK/MOU metadata disimpan di `soegiri_offline_library_v1`, sedangkan file PDF disimpan di persistent named cache/IndexedDB.

Versi sebelumnya memanggil `clearAllFileLocalCache()` saat:
- sesi dicabut karena login di perangkat lain;
- idle timeout;
- absolute timeout;
- logout manual.

`clearAllFileLocalCache()` menghapus seluruh key ber-prefix `sop_file_cache_`, termasuk key `sop_file_cache_named_library_<id>` milik SK/MOU. Akibatnya metadata dokumen tetap ada, tetapi PDF hilang. UI kemudian menampilkan `File PDF Tidak Ditemukan` dan Lihat/Download gagal.

## Perbaikan

1. Logout/session timeout tidak lagi menghapus persistent official document files.
2. `clearAllFileLocalCache()` dipertahankan sebagai compatibility no-op agar tidak ada caller lama yang kembali menghapus dokumen resmi.
3. Resolver SK/MOU sekarang:
   - memakai URL eksternal bila ada;
   - mencari canonical named cache;
   - fallback ke legacy SPO file cache;
   - otomatis memigrasikan file legacy yang ditemukan ke canonical library cache.
4. Upload SK/MOU tetap menyimpan file ke named persistent cache + IndexedDB.
5. Backup/restore SK/MOU tetap menggunakan `skFiles` dan `mouFiles` terpisah.

## Dampak pada data lama

Jika metadata SK/MOU sudah tersisa tetapi binary PDF memang sudah terhapus oleh versi lama dan tidak ada backup/legacy cache, file tidak dapat direkonstruksi oleh aplikasi. Dokumen tersebut harus diunggah ulang atau dipulihkan dari backup.

## Rule Akses

- User tanpa badge STRUKTURAL: tidak boleh membuka SK/MOU.
- User dengan badge STRUKTURAL: boleh lihat/download/upload sesuai rule.
- Administrator: memiliki akses lebih tinggi.

## Status

Root cause teridentifikasi dan diperbaiki pada source.
Build production belum dinyatakan PASS karena dependency `node_modules` tidak tersedia pada environment audit.
