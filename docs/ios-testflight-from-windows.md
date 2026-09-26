# SIDOKTER iOS — TestFlight dari Windows

Dokumen ini menjelaskan jalur resmi SIDOKTER dari Windows ke iPhone tanpa Xcode lokal:

Windows → GitHub → GitHub Actions macOS runner → signed iOS archive/IPA → App Store Connect → TestFlight → iPhone.

## 1. Prasyarat Apple

1. Apple Developer Program aktif.
2. App Store Connect dapat diakses.
3. App ID eksplisit menggunakan bundle ID:
   `id.go.lamongankab.rsudsoegiri.sidokter`
4. App record SIDOKTER dibuat di App Store Connect dengan bundle ID yang sama.
5. Apple Distribution certificate + private key tersedia dalam format `.p12`.
6. App Store Connect provisioning profile untuk bundle ID tersebut tersedia.
7. App Store Connect API Team Key tersedia untuk upload build.

## 2. GitHub Secrets yang diperlukan

Tambahkan pada repository Settings → Secrets and variables → Actions:

- `APPLE_TEAM_ID`
  - Team ID Apple Developer.
- `APPLE_DISTRIBUTION_P12_BASE64`
  - Isi file `.p12` yang diubah ke Base64.
- `APPLE_DISTRIBUTION_P12_PASSWORD`
  - Password saat `.p12` diekspor.
- `APPLE_PROVISIONING_PROFILE_BASE64`
  - Isi file `.mobileprovision` App Store Connect yang diubah ke Base64.
- `APPSTORE_API_KEY_ID`
  - Key ID App Store Connect API.
- `APPSTORE_API_ISSUER_ID`
  - Issuer ID App Store Connect API.
- `APPSTORE_API_PRIVATE_KEY`
  - Isi lengkap file `AuthKey_<KEYID>.p8`, termasuk header dan footer PRIVATE KEY.

Jangan commit file `.p12`, `.mobileprovision`, `.p8`, atau nilainya ke repository.

## 3. Mengubah file menjadi Base64 dari Windows

PowerShell:

### Distribution certificate

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\distribution.p12")) | Set-Clipboard
```

Paste hasil clipboard ke secret `APPLE_DISTRIBUTION_P12_BASE64`.

### Provisioning profile

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\SIDOKTER_AppStore.mobileprovision")) | Set-Clipboard
```

Paste hasil clipboard ke secret `APPLE_PROVISIONING_PROFILE_BASE64`.

Untuk `.p8`, buka sebagai text dan copy seluruh isi file ke `APPSTORE_API_PRIVATE_KEY`.

## 4. Menjalankan pipeline tanpa upload

GitHub → Actions → **iOS TestFlight** → Run workflow.

Isi:

- marketing_version: contoh `1.0.0`
- build_number: contoh `1`
- upload: `false`

Mode ini melakukan install dependency, lint, web build, Capacitor sync, mengecek Xcode 26+, lalu membuat Release archive tanpa signing. Gunakan untuk memastikan pipeline tetap sehat tanpa menyentuh App Store Connect.

## 5. Upload build ke TestFlight

Setelah seluruh secret terisi dan App Store Connect record sudah dibuat:

GitHub → Actions → **iOS TestFlight** → Run workflow.

Isi:

- marketing_version: `1.0.0`
- build_number: nilai unik yang lebih besar dari build sebelumnya
- upload: `true`

Pipeline akan:

1. validate seluruh secret,
2. build aplikasi web,
3. sync Capacitor,
4. import Apple Distribution certificate ke temporary keychain,
5. validasi provisioning profile terhadap Team ID dan bundle ID SIDOKTER,
6. archive Release iOS,
7. export IPA App Store Connect,
8. validate IPA ke App Store Connect,
9. upload IPA,
10. simpan IPA sebagai GitHub Actions artifact sementara.

Credential signing hanya hidup pada macOS runner selama job dan tidak ditulis ke repository.

## 6. Setelah upload berhasil

App Store Connect memproses build terlebih dahulu. Setelah build muncul:

1. buka App Store Connect → Apps → SIDOKTER → TestFlight,
2. lengkapi informasi beta bila diminta,
3. tambahkan akun Apple ID sebagai Internal Tester,
4. install aplikasi TestFlight dari App Store di iPhone,
5. buka undangan/TestFlight lalu install SIDOKTER.

Internal testing adalah jalur paling cepat untuk pengujian iPhone fisik. External testing memiliki proses TestFlight App Review tambahan.

## 7. Regression fisik wajib

Setelah SIDOKTER terpasang dari TestFlight, jalankan `docs/ios-device-regression.md`.

Prioritas pertama:

- login Admin/User/STRUKTURAL,
- session background/foreground dan force-close/reopen,
- preview Existing PDF,
- upload PDF/DOCX dari Files dan iCloud,
- Save to Files/Share Sheet,
- Wi‑Fi off/on dan Wi‑Fi ↔ cellular,
- PC upload → iPhone preview,
- iPhone upload → PC preview,
- logout/session multi-device.

Tahap 6 baru dinyatakan selesai setelah pengujian device asli ini lulus dan P0/P1 = 0.
