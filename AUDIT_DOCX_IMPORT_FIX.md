# AUDIT & FIX — Import SPO Word (.DOCX)

Tanggal audit: 5 September 2026

## Kesimpulan

Fitur Import SPO dari Word memang sudah terhubung ke Tahap 3 SPO Baru, tetapi audit kedua menemukan dua titik yang berpotensi membuat hasil import tidak konsisten pada dokumen Word rumah sakit yang memakai tabel:

1. Jika satu bagian (terutama PROSEDUR) terdiri dari beberapa baris tabel, parser versi sebelumnya hanya mengambil bagian pertama.
2. Jika Word memiliki label `JUDUL SPO` pada satu baris lalu nilai judul pada baris berikutnya, fallback teks dapat salah mengenali label sebagai judul.

Kedua masalah tersebut sudah diperbaiki.

## Alur yang dikunci

`SPO Baru → Tahap 3 / Isi Standar SPO → Import Word (.DOCX) → Parser → SopLiveTemplate → edit manual → submit workflow existing`

Field yang diimport:

- Judul
- Tanggal
- Pengertian
- Tujuan
- Kebijakan
- Prosedur
- Alur
- Unit Terkait

## Perubahan yang diaudit

### `src/components/UploadSopModal.tsx`

- Import hanya tersedia untuk `documentType === 'BARU'` pada tab `konten`.
- Hasil import langsung mengisi state yang dipakai `SopLiveTemplate`.
- Setelah import, UI otomatis berada di tab Tahap 3 sehingga hasil dapat langsung diperiksa dan diedit.
- Import mengganti isi field berdasarkan file Word saat ini; field yang tidak ditemukan dikosongkan agar tidak ada data lama/stale yang ikut terbawa dari import sebelumnya.
- File DOCX tidak pernah dimasukkan ke `selectedFile` atau `fileDataUrl`.
- Karena `selectedFile/fileDataUrl` tidak disentuh oleh handler DOCX, file Word tidak menjadi lampiran dokumen.
- `selectedFile` tetap dipakai oleh workflow lampiran resmi Existing/Riviu seperti sebelumnya.
- Validasi submit dan objek `newSopDoc` tetap memakai field batang tubuh yang sama (`pengertian`, `tujuan`, `kebijakan`, `prosedur`, `alur`, `unitTerkait`).

### `src/utils/docxParser.ts`

- Menggunakan Mammoth untuk membaca `.DOCX` di browser.
- Mendukung format tabel dengan label pada kolom pertama atau kedua.
- Beberapa kolom isi dalam satu baris digabung.
- **Baris-baris berulang pada section yang sama sekarang digabung**, sehingga PROSEDUR/UNIT TERKAIT yang terpecah beberapa baris tidak berhenti pada baris pertama.
- Label `Judul SPO` saja tidak dianggap sebagai judul; nilai pada sel berikutnya dicari.
- Fallback teks mendukung pola `JUDUL SPO:` dan pola label pada satu baris dengan nilai di baris berikutnya.
- Label judul saja tidak lagi salah diambil sebagai judul saat fallback first-lines.
- Gambar/figure dari hasil konversi HTML diizinkan oleh sanitasi agar diagram ALUR tidak sengaja dibuang bila Mammoth menghasilkan elemen gambar.
- Tanggal dinormalisasi ke `YYYY-MM-DD` untuk input tanggal aplikasi.

## Existing / Riviu / workflow lain

Audit perbandingan file menunjukkan perubahan fungsional hanya berada pada:

- `src/components/UploadSopModal.tsx`
- `src/utils/docxParser.ts`
- file dokumentasi audit ini

Tidak ada file lain yang berubah dibanding ZIP sumber sebelum patch Import DOCX.

Mode `LAMA` (SPO Existing) dan `REVIEW` (SPO Riviu) tidak diberi kontrol Import DOCX dan handler import memiliki guard UI pada mode `BARU`.

## Validasi yang dilakukan

- ZIP integrity: **OK / tidak corrupt** (`unzip -t`).
- Struktur root ZIP: **OK**, tidak ada nested project folder.
- Perbandingan source dengan ZIP sumber: hanya dua source file terkait fitur dan satu file audit yang berubah.
- TypeScript static check dijalankan. Environment audit tidak memiliki `node_modules`, sehingga TypeScript mengeluarkan error dependency `TS2307` untuk React/Mammoth/DOMPurify/Node dan dependency aplikasi lainnya. Itu berarti **full build runtime belum dapat diklaim tervalidasi di environment audit ini**.

## Status jujur

**Source-level audit: PASS setelah patch.**

**Runtime/browser build: belum bisa diberi label 100% PASS dari environment ini karena dependency project tidak ter-install.**

Untuk verifikasi runtime di server/PC project:

```bash
npm install
npm run build
```

Lalu uji minimal:

1. SPO Baru → Tahap 3.
2. Import `.DOCX`.
3. Pastikan 8 field terisi jika semuanya tersedia di Word.
4. Edit salah satu field → pastikan tetap bisa diedit.
5. Submit/save → pastikan isi tersimpan.
6. Buka Lampiran → pastikan DOCX import **tidak** muncul sebagai lampiran.
7. Uji Existing dan Riviu → pastikan workflow tetap seperti sebelumnya.
