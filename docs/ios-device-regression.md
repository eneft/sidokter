# SIDOKTER iOS — Device Regression Checklist

Dokumen ini adalah checklist wajib sebelum build iOS dinyatakan siap TestFlight/App Store. Hasil simulator **tidak menggantikan** pengujian iPhone asli untuk Files/iCloud, Share Sheet, kamera, jaringan seluler, background lifecycle, dan cross-device.

## A. Instalasi & Startup

- [ ] App terpasang pada iPhone tanpa crash saat launch pertama.
- [ ] Splash screen tampil wajar lalu hilang setelah bootstrap selesai.
- [ ] Status bar tidak menutup header.
- [ ] Safe area benar pada iPhone notch/Dynamic Island.
- [ ] Portrait dan landscape tidak memotong navigasi penting.

## B. Login & Session

- [ ] Login Admin berhasil.
- [ ] Login User biasa berhasil.
- [ ] Login User badge STRUKTURAL berhasil.
- [ ] Login User assignment ALL tetap menampilkan cakupan sesuai baseline.
- [ ] Background 30 detik → foreground: session tetap valid.
- [ ] Background beberapa menit → foreground: profile/session direfresh tanpa logout palsu.
- [ ] Force close → reopen: state sesi sesuai kebijakan SIDOKTER.
- [ ] Logout membersihkan state dan kembali ke Dashboard setelah login berikutnya.

## C. Navigasi & UI

- [ ] Header/mobile drawer dapat discroll sampai item terakhir.
- [ ] Keyboard tidak menutupi field aktif pada form panjang.
- [ ] Modal dapat ditutup dan tidak terjebak di bawah keyboard.
- [ ] Tidak ada horizontal overflow tidak disengaja.
- [ ] Tampilan tabel/list SPO tetap terbaca.
- [ ] Nomor SPO tampil utuh sesuai baseline.

## D. SPO Workflow Regression

- [ ] SPO Baru: Jenis → Hirarki → Batang Tubuh berjalan berurutan.
- [ ] Tombol final hanya muncul pada Tahap 3.
- [ ] Terbitkan Nomor tidak berubah menjadi dokumen Draft.
- [ ] Nomor Terbit hanya dapat dipakai pada Riviu sesuai rule.
- [ ] SPO Existing PDF tetap mempertahankan binary PDF asli.
- [ ] SPO Existing DOCX masuk alur ekstraksi/Live SPO sesuai baseline.
- [ ] SPO Riviu menerbitkan nomor SPO baru dan Nomor Revisi +1.
- [ ] DRAFT / AKTIF / DIARSIPKAN tidak berubah makna.
- [ ] Aktivasi Admin berjalan sesuai RBAC.

## E. PDF & Document Viewer

- [ ] PDF Existing dapat dipreview di iPhone.
- [ ] PDF multi-page dapat discroll tanpa blank page/crash.
- [ ] Zoom/scroll tidak merusak layout modal.
- [ ] PDF dari PC dapat dibuka pada iPhone.
- [ ] PDF dari iPhone dapat dibuka pada PC lain setelah upload.
- [ ] PDF asli tidak diregenerate atau berubah isi saat download.

## F. Upload dari iPhone

Uji sumber file berikut:

- [ ] Files → On My iPhone.
- [ ] Files → iCloud Drive.
- [ ] PDF.
- [ ] DOCX.
- [ ] Nama file panjang.
- [ ] Nama file dengan spasi.
- [ ] File berukuran kecil dan file representatif ukuran besar.

Validasi:

- [ ] Upload berhasil masuk Firebase Storage authoritative.
- [ ] Metadata `storage_files.objectPath` benar.
- [ ] File dapat dibuka ulang setelah app ditutup.
- [ ] File dapat dibuka dari perangkat lain.

## G. Download / Share Sheet

- [ ] Download dokumen membuka Share Sheet native.
- [ ] "Save to Files" berhasil.
- [ ] Simpan ke iCloud Drive berhasil.
- [ ] Bagikan ke aplikasi lain tidak mengubah file asli.
- [ ] Nama file dan ekstensi PDF/DOCX tetap benar.
- [ ] Cancel Share Sheet tidak menyebabkan error aplikasi.

## H. Network & Lifecycle

- [ ] Wi‑Fi aktif → aplikasi online normal.
- [ ] Matikan Wi‑Fi/data → banner offline tampil.
- [ ] Aktifkan jaringan kembali → aplikasi pulih tanpa reload paksa.
- [ ] Request yang membutuhkan server tidak menampilkan sukses palsu saat offline.
- [ ] Pindah Wi‑Fi ↔ cellular tidak memutus session.
- [ ] Lock screen → unlock → session tetap konsisten.
- [ ] Background → foreground saat DocumentViewer terbuka tidak crash.

## I. RBAC

- [ ] Admin: akses penuh sesuai baseline.
- [ ] User STRUKTURAL: akses lintas hirarki sesuai rule tanpa berubah menjadi Admin.
- [ ] User biasa: hanya hirarki yang diizinkan.
- [ ] SK/MOU/Library untuk user tanpa STRUKTURAL tetap ditolak.
- [ ] ALL hanya menjadi cakupan pilihan hirarki, bukan token nomor SPO.

## J. Cross-device Matrix

- [ ] iPhone upload PDF → PC preview/download.
- [ ] PC upload PDF → iPhone preview/download.
- [ ] iPhone upload DOCX → PC dapat mengakses hasil sesuai workflow.
- [ ] PC membuat Draft → iPhone melihat status yang sama.
- [ ] Admin aktivasi di PC → status di iPhone ikut berubah.
- [ ] Logout iPhone tidak menghapus session perangkat lain bila policy multi-device mengizinkan.

## K. Exit Criteria Tahap 6

Tahap 6 dinyatakan selesai bila:

1. Simulator regression workflow hijau.
2. App install + launch + relaunch smoke hijau.
3. Seluruh item kritis A, B, D, E, F, G, H, I, J diuji pada minimal satu iPhone asli.
4. Tidak ada regression terhadap numbering, RBAC, Firebase Storage, PDF Existing, dan workflow SPO.
5. Temuan P0/P1 = 0 sebelum masuk signing/TestFlight.
