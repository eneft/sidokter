# AUDIT + FIX — SPO BARU / EXISTING / RIVIU

Tanggal: 2026-09-02

## Temuan audit

| Area | Status | Hasil |
|---|---|---|
| Validasi Riviu di UserView | 🟢 | Tetap dibatasi `isReview`. Tidak diubah ke jalur Existing. |
| Validasi Riviu di App | 🟢 secara konsep | Validasi tetap khusus Riviu setelah boundary diperbaiki. |
| Existing tidak boleh memicu validasi Riviu | 🔴 BUG → FIXED | `isRiviuInput` sekarang wajib `!isExistingInput`. |
| Pewarisan `documentType` dari `matchedExistingDoc` | 🔴 BUG POTENSIAL KRITIS → FIXED | Payload UserView tidak lagi mewarisi `documentType` dari dokumen existing. |
| Pewarisan `jenis_spo` dari `matchedExistingDoc` | 🔴 BUG POTENSIAL KRITIS → FIXED | Payload UserView tidak lagi mewarisi `jenis_spo` dari dokumen existing. |
| Legacy/Existing identity | 🔴 perlu diperbaiki → FIXED | Boundary submit Existing selalu mengirim `documentType=LAMA`, `jenis_spo=EKSISTING`; finalisasi replacement dilakukan App setelah boundary. |
| Numbering Existing | 🟢 | Rule existing/reservation dipertahankan. |
| Reservation Existing | 🟢 | `EXISTING_REPLACE_ONLY` tetap dipertahankan. |

## Rule terkunci

Workflow user harus menjadi sumber kebenaran:

- SPO BARU → BARU
- SPO EXISTING → EKSISTING
- SPO RIVIU → RIVIU

Metadata dokumen lama tidak boleh mengubah workflow yang dipilih user.

## Perubahan kode

### `src/components/UserView.tsx`

Payload Existing sekarang selalu menetapkan:

- `documentType: 'LAMA'`
- `jenis_spo: 'EKSISTING'`

`matchedExistingDoc.documentType` dan `matchedExistingDoc.jenis_spo` tidak lagi dipakai untuk menentukan workflow.

### `src/App.tsx`

Validasi Riviu menggunakan boundary keras:

`isRiviuInput = !isExistingInput && (...)`

Dengan demikian metadata review/legacy yang tersisa pada data lama tidak dapat membuat workflow Existing masuk ke validasi Riviu.

Setelah boundary tersebut, Existing diproses pada blok `if (isExistingInput)` sendiri.

## Hal yang tidak diubah

- Baseline UI SPO LOCKED.
- Progressive UI.
- Halaman depan SPO.
- Numbering Existing.
- Reservation Existing.
- Workflow Riviu selain pemisahan boundary.
- Permission dan session.

## Verifikasi source

- Patch assertions: PASS.
- Semua targeted Riviu validation references ditemukan hanya di blok Riviu yang teridentifikasi.
- Existing boundary berada sebelum blok Existing dan Riviu tidak dapat dimasuki oleh `isExistingInput`.
- ZIP integrity akan diverifikasi setelah packaging.
- Full production build belum dapat dinyatakan PASS jika dependency environment belum tersedia.
