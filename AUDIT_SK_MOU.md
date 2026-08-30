# Audit Fitur SK & MOU

Tanggal audit: 27 Agustus 2026

## Hasil

### 1. Routing halaman
- Admin memiliki page Dokumen SK dan Dokumen MOU sendiri.
- Petugas memiliki page Dokumen SK dan Dokumen MOU sendiri.
- SPO tetap menggunakan page/library SPO yang sudah ada.

### 2. Upload
- Upload hanya menerima PDF.
- Hanya role `admin` yang dapat membuka dan menjalankan upload.
- Batas aplikasi: 20 MB, konsisten dengan Storage Rules.
- Jika penyimpanan metadata database cloud gagal setelah upload Storage, file Storage dicoba dihapus kembali untuk mencegah orphan file.

### 3. Preview
- SK dan MOU menggunakan komponen `DocumentViewer` yang sama dengan SPO.
- Viewer memakai `downloadUrl` dokumen.

### 4. Download
- Tombol Download tersedia untuk semua user yang dapat membuka page.
- URL file berasal dari layanan cloud Storage.

### 5. Edit
- Hanya Admin yang melihat tombol Edit.
- Service `updateLibraryDocumentTitle` menolak role selain `admin`.
- Edit hanya mengubah metadata judul, tidak mengganti PDF.

### 6. Hapus
- Hanya Admin yang melihat tombol Hapus.
- Service `deleteLibraryDocument` menolak role selain `admin`.
- Penghapusan database cloud dan Storage dijalankan dari service.

### 7. Pemisahan jenis dokumen
- `LibraryDocumentType` hanya `SK | MOU`.
- Page SK hanya menampilkan dokumen bertipe SK.
- Page MOU hanya menampilkan dokumen bertipe MOU.

## Static verification

- Arsip ZIP dapat diekstrak.
- Tidak ditemukan referensi `DocumentLibraryTab` sebagai pengganti page SK/MOU; page khusus `SKPage` dan `MOUPage` tersedia.
- Tidak ditemukan error JSX `Expected ")" but found "documents"` pada `PetugasView.tsx` setelah perbaikan sebelumnya.
- Pemeriksaan TypeScript tidak menemukan diagnostic syntax error baru. Pemeriksaan penuh belum dapat dijalankan karena `node_modules` tidak tersedia di environment audit dan instalasi dependency mengalami timeout.

## Catatan keamanan penting

database cloud Rules dan Storage Rules pada baseline masih menggunakan custom-auth client dan belum mempunyai mekanisme layanan cloud Auth `request.auth` untuk membedakan Admin/Petugas. Karena itu pembatasan role yang ada saat ini kuat di UI/service client, tetapi belum dapat disebut server-enforced/anti-bypass pada layanan cloud Rules.

Jangan mengklaim fitur Admin-only sudah 100% aman sebelum lapisan backend/layanan cloud Auth untuk authorization diselesaikan.

## Kesimpulan

Secara struktur aplikasi, fitur SK/MOU sudah lengkap untuk alur:

`Admin -> Upload PDF -> Simpan -> Library -> Preview -> Download`

serta:

`Admin -> Edit/Hapus`

`Petugas -> Preview/Download`

Build runtime produksi tetap perlu diuji di environment dengan dependency terpasang dan koneksi layanan cloud aktif.
